/**
 * Module dependencies
 */

var stack = require('simple-stack-common');
var tmpdir = require('os').tmpdir() + '/shoelace-ui-showcase';
var fs = require('fs');
var mkdir = fs.mkdir;
var mkdirp = require('mkdirp');
var debug = require('debug')('shoelace-ui-showcase');
var hash = require('crypto').createHash;
var builder = require('poe-ui-builder');
var rimraf = require('rimraf');
var co = require('co');
var cogent = require('cogent');

mkdirp.sync(tmpdir);

var VIEWS = __dirname + '/views';
var SHA_RE = /^[0-9a-fA-F]{40}$/;

/**
 * Setup client
 */

var GITHUB_USERNAME = process.env.GITHUB_USERNAME;
var GITHUB_PASSWORD = process.env.GITHUB_PASSWORD;

if (GITHUB_USERNAME && GITHUB_PASSWORD) {
  cogent = cogent.extend({
    auth: GITHUB_USERNAME + ':' + GITHUB_PASSWORD
  });
}

var request = co(cogent);

/**
 * Forwarding headers
 */

var headers = {
  host: 'x-orig-host',
  path: 'x-orig-path',
  port: 'x-orig-port',
  proto: 'x-orig-proto'
};

module.exports = function(opts) {
  opts = opts || {};
  opts.base = headers;

  var app = stack(opts);

  app.set('view engine', 'jade');

  app.locals({
    logo: opts.logo || 'http://i.imgur.com/ARDWcLZ.png'
  });

  app.useBefore('router', '/', function defaults(req, res, next) {
    res.locals({
      base: req.base,
      title: '',
      description: '',
      styles: []
    });
    next();
  });

  app.get('/', addAglet, function(req, res) {
    if (opts.defaultTheme) return res.redirect(req.base + '/' + opts.defaultTheme);
    res.render(VIEWS + '/landing.jade');
  });

  app.post('/', function(req, res) {
    var url = req.base + '/' + req.body.org + '/' + req.body.repo;
    if (req.body.version) url += '/' + req.body.version;
    res.redirect(url);
  });

  app.get('/:org/:repo', addAglet, handleVersions);
  app.get('/:org/:repo/:sha', validateHash, addLinks, handleIndex);

  ['typography', 'buttons'].forEach(function(page) {
    app.get('/:org/:repo/:sha/' + page, validateHash, addLinks, function(req, res) {
      res.render(VIEWS + '/' + page + '.jade', {
        showNav: true
      });
    });
  });

  // assets
  app.get('/:org/:repo/:sha/build/theme.css', validateHash, handleStyle);
  app.get('/:org/:repo/:sha/build/*', validateHash, handleFile);

  return app;
};

function addLinks(req, res, next) {
  var org = req.param('org');
  var repo = req.param('repo');
  var sha = req.param('sha');
  var l = res.locals.location = req.base + '/' + org + '/' + repo + '/' + sha;
  res.locals.styles.push(l + '/build/theme.css');
  next();
}

function addAglet(req, res, next) {
  res.locals.styles.push(req.base + '/shoelace-ui/aglet/master/build/theme.css');
  next();
}

function handleVersions(req, res, next) {
  var org = req.params.org;
  var repo = req.params.repo;

  var base = 'https://api.github.com/repos/' + org + '/' + repo;
  var tagsurl = base + '/tags';
  var branchesurl = base + '/branches';
  var refs = [];

  function format(ref) {
    var sha = ref.commit.sha;
    refs.push({
      name: ref.name,
      sha: ref.commit.sha,
      commit: ref.commit.url,
      url: req.base + '/' + org + '/' + repo + '/' + sha
    });
  }

  request(tagsurl, {json: true}, function(err, tags) {
    if (err) return next(err);
    if (tags.statusCode !== 200) return next(new Error(tags.text));

    tags.body.forEach(format);

    request(branchesurl, {json: true}, function(err, branches) {
      if (err) return next(err);
      if (branches.statusCode !== 200) return next(new Error(branches.text));

      branches.body.forEach(format);

      res.render(VIEWS + '/versions.jade', {
        org: req.params.org,
        repo: req.params.repo,
        refs: refs
      });
    });
  });
}

function handleIndex(req, res, next) {
  var sha = req.params.sha;
  var org = req.params.org;
  var repo = req.params.repo;

  res.render(VIEWS + '/index.jade', {
    org: req.params.org,
    repo: req.params.repo,
    showNav: true
  });
}

function handleStyle(req, res, next) {
  var org = req.param('org');
  var repo = req.param('repo');
  var sha = req.param('sha');

  var hashed = dirname(req);

  var dir = tmpdir + '/' + hashed;
  var file = dir + '/build.css';

  send(function() {
    debug('trying to create dir', dir);
    mkdir(dir, function(err) {
      if (err) console.log(err.stack || err);
      if (err) return poll();
      build();
    });
  });

  function poll() {
    debug('polling');
    setTimeout(function() {
      send(poll);
    }, 1000);
  }

  function build() {
    debug('building');
    var component = {
      name: hashed,
      dependencies: {}
    };
    component.dependencies[org + '/' + repo] = sha;

    fs.writeFile(dir + '/component.json', JSON.stringify(component), function(err) {
      if (err) return error(err);
      var opts = {
        // TODO get this working
        // dir: dir + '/components'
      };
      builder.styles(dir, null, file, opts, function(err) {
        if (err) return error(err);
        send();
      });
    });
  }

  function send(fn) {
    res.sendfile(file, {maxAge: 31536000}, function(err) {
      if (!err) return;
      fn && fn();
    });
  }

  function error(err) {
    rimraf(dir, function() {
      res.set('content-type', 'text/css');
      var msg = ((err.stack || err) + '\n').replace(/\n/g, '____NEW_LINE___');
      var content = JSON.stringify(msg).replace(/____NEW_LINE___/g, '\\A');
      res.send('body:before{white-space: pre; content:' + content + ';}');
    });
  }
}

function handleFile(req, res) {
  var dir = tmpdir + '/' + dirname(req);
  res.sendfile(dir + '/' + req.params[0]);
}

function validateHash(req, res, next) {
  var sha = req.params.sha;
  var org = req.params.org;
  var repo = req.params.repo;

  if (SHA_RE.test(sha)) return next();

  builder.remotes.resolve(org + '/' + repo, sha)
    .next()
    .value(function(err, branch) {
      if (err) return next(err);
      if (Array.isArray(branch)) return resolveRefs(branch, 0);
      resolveRef(branch);
    });

  function resolveRefs(refs, i) {
    var ref = refs[i];
    if (!ref) return resolveRef(refs[0]);
    if (SHA_RE.test(ref)) return redirect(ref);
    resolveRefs(refs, i + 1);
  }

  function resolveRef(ref) {
    var url = 'https://api.github.com/repos/' + org + '/' + repo + '/commits/' + ref;
    request(url, {json: true}, function(err, resp) {
      if (err) return next(err);
      if (resp.statusCode !== 200) return next(new Error(resp.text));
      redirect(resp.body.sha);
    });
  }

  function redirect(ref) {
    var base = '/' + org + '/' + repo;
    var rest = req.url.replace(base + '/' + sha, '');
    res.redirect(req.base + base + '/' + ref + rest);
  }
}

function dirname(req) {
  var org = req.param('org');
  var repo = req.param('repo');
  var sha = req.param('sha');

  return hash('sha1')
    .update(org + '/' + repo + '/' + sha)
    .digest('hex');
}
