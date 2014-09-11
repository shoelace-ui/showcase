/**
 * Module dependencies
 */

var debug = require('debug')('showcase:stylus');
var stylus = require('stylus');
var fs = require('fs');
var merge = require('./utils').merge;
var tmpdir = require('os').tmpdir() + '/shoelace-ui-showcase';
var spawn = require('child_process').spawn;
var rimraf = require('rimraf');

var package = require('./package.json');

var defaults = {
  import: [
    'shoelace-ui-aglet',
    'index'
  ],
  paths: [
    __dirname + '/node_modules',
    __dirname + '/stylesheets'
  ]
};

exports = module.exports = function(org, repo, ref, token, opts, fn) {
  ref = ref || 'master';
  var out = resolveCss(org, repo, ref);
  var dir = resolve(org, repo, ref);

  read(clearDir);

  function clearDir(err, res) {
    if (typeof res === 'string' && !opts.force) return fn(null, res);
    debug('clearing directory ' + dir);
    rimraf(dir, build);
  }

  function build() {
    debug('running build');
    exports.build(org, repo, ref, token, dir, done);
  }

  function done(err) {
    if (err) return fn(err, formatErrorCss(err));
    read(function(err, res) {
      fn(err, res);
    });
  }

  function read(cb) {
    debug('reading ' + out);
    fs.readFile(out, 'utf8', function(err, res) {
      debug('read ' + out);
      cb(err, res);
    });
  }
};

function formatErrorCss(err) {
  return 'body:before {content: "' + (err.stack || err.message || err).replace(/\"/, '\\"').replace(/\n/, '\\n') + '";}';
}

function run(command, args, opts, fn) {
  var proc = spawn(command, args, opts);
  var error = '';
  proc.stdout.on('data', function(data) {
    process.stdout.write(data);
  });
  proc.stderr.on('data', function(data) {
    process.stderr.write(data);
    error += data;
  });
  proc.on('close', function(code) {
    if (code === 0) return fn();
    var err = new Error(error);
    err.code = code;
    fn(err);
  });
  return proc;
}

function resolve(org, repo, ref) {
  return tmpdir + '/' +
    sanitize(org) + '~' +
    sanitize(repo) + '@' +
    sanitize(ref);
}

function resolveCss(org, repo, ref) {
  return resolve(org, repo, ref) + '.css';
}

function sanitize(value) {
  return value.replace(/\//g, '-');
}

function formatGithub(org, repo, token) {
  return 'https://' + (token ? token + ':x-oauth-basic@' : '') + 'github.com/' + org + '/' + repo + '.git';
}

exports.render = function (string, options, fn) {
  if (typeof fn !== 'function') {
    fn = options;
    options = {};
  }

  options = merge(defaults, options);

  var styl = stylus(string, options);

  options.import.forEach(function(imp){
    styl.import(imp);
  });

  styl.render(fn);
};

exports.install = function(org, repo, ref, token, dir, fn) {
  debug('npm install ' + dir);
  run('npm', ['install'], {cwd: dir}, fn);
};

exports.clone = function(org, repo, ref, token, target, fn) {
  var url = formatGithub(org, repo, token);
  debug('git clone -b ' + ref + ' ' + url + ' ' + target);
  run('git', ['clone', '-b', ref, url, target], {}, fn);
};

exports.build = function build(org, repo, ref, token, dir, fn) {
  var options = {
    paths: [
      __dirname,
      dir,
      dir + '/node_modules'
    ]
  };

  exports.clone(org, repo, ref, token, dir, install);

  function install(err) {
    if (err) return fn(err);
    exports.install(org, repo, ref, token, dir, load);
  }

  function load(err) {
    if (err) return fn(err);
    fs.readFile(dir + '/index.styl', 'utf8', render);
  }

  function render(err, str) {
    if (err) return fn(err);
    exports.render(str, options, done);
  }

  function done(err, res) {
    if (err) return fn(err);
    fs.writeFile(resolveCss(org, repo, ref), res || '', fn);
  }
};
