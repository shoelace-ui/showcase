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
var request = co(require('cogent'));

mkdirp.sync(tmpdir);

var VIEWS = __dirname + '/views';
var SHA_RE = /^[0-9a-fA-F]{40}$/;

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

  app.useBefore('router', '/', function defaults(req, res, next) {
    res.locals({
      base: req.base,
      title: '',
      description: '',
      styles: []
    });
    next();
  });

  app.get('/', function(req, res) {
    if (opts.defaultTheme) return res.redirect(req.base + '/' + opts.defaultTheme);
    res.render(VIEWS + '/landing.jade');
  });

  app.post('/', function(req, res) {
    var url = req.base + '/' + req.body.org + '/' + req.body.repo;
    if (req.body.version) url += '/' + req.body.version;
    res.redirect(url);
  });

  app.get('/:org/:repo', handleVersions);
  app.get('/:org/:repo/:sha', addLinks, handleIndex);

  ['typography', 'buttons'].forEach(function(page) {
    app.get('/:org/:repo/:sha/' + page, addLinks, function(req, res) {
      res.render(VIEWS + '/' + page + '.jade');
    });
  });

  // assets
  app.get('/:org/:repo/:sha/build/theme.css', handleStyle);
  app.get('/:org/:repo/:sha/build/*', handleFile);

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

  if (render(sha)) return;

  builder.remotes.resolve(org + '/' + repo, sha)
    .next()
    .value(function(err, branch) {
      if (err) return next(err);
      if (Array.isArray(branch)) return resolveRefs(branch, 0);
      resolveRef(branch);
    });

  function render() {
    if (!SHA_RE.test(sha)) return false;
    res.render(VIEWS + '/index.jade', {
      org: org,
      repo: repo
    });
    return true;
  }

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
    res.redirect(req.base + '/' + org + '/' + repo + '/' + ref);
  }
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

function dirname(req) {
  var org = req.param('org');
  var repo = req.param('repo');
  var sha = req.param('sha');

  return hash('sha1')
    .update(org + '/' + repo + '/' + sha)
    .digest('hex');
}
