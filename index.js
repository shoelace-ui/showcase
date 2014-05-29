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

mkdirp.sync(tmpdir);

module.exports = function(opts) {
  var app = stack(opts);

  app.set('view engine', 'jade');

  var views = __dirname + '/views';

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
    res.render(views + '/landing.jade');
  });

  app.post('/', function(req, res) {
    var url = '/' + req.body.org + '/' + req.body.repo;
    if (req.body.version) url += '/' + req.body.version;
    res.redirect(url);
  });

  app.get('/:org/:repo', function(req, res) {
    res.render(views + '/versions.jade', {
      org: req.params.org,
      repo: req.params.repo
    });
  });

  app.get('/:org/:repo/:sha', addStyle, function(req, res) {
    // TODO resolve the version and check equality
    res.render(views + '/index.jade', {
      org: req.params.org,
      repo: req.params.repo
    });
  });

  ['typography', 'buttons'].forEach(function(page) {
    app.get('/:org/:repo/:sha/' + page, addStyle, function(req, res) {
      res.render(views + '/' + page + '.jade');
    });
  });

  function addStyle(req, res, next) {
    res.locals.styles.push('/themes/' + req.param('org') + '/' + req.param('repo') + '/' + req.param('sha') + '.css');
    next();
  }

  app.get('/themes/:org/:repo/:sha.css', function(req, res, next) {
    var org = req.param('org');
    var repo = req.param('repo');
    var sha = req.param('sha');

    var hashed = hash('sha1')
      .update(org + '/' + repo + '/' + sha)
      .digest('hex');

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
  });

  return app;
};
