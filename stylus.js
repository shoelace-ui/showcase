/**
 * Module dependencies
 */

var debug = require('debug')('showcase:stylus');
var stylus = require('stylus');
var fs = require('fs');
var npm = require('npm');
var merge = require('./utils').merge;
var tmpdir = require('os').tmpdir() + '/shoelace-ui-showcase';

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

exports.render = function render(string, options, fn){
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

exports.install = function install(path, fn){
  var target = 'git+https://github.com/' + path + '.git';
  npm.load(package, function(err){
    if (err) return fn(err);
    npm.commands.install([target], function(err, data){
      if (err) return fn(err);
      fn();
    });
  });
};

exports.build = function build(path, fn){
  var org = path.split('/')[0];
  var repo = path.split('/')[1];
  if (org === 'shoelace-ui') repo = org + '-' + repo;
  var root = __dirname + '/node_modules/' + repo;
  var main = root + '/index.styl';

  var options = {
    paths: [
      root,
      root + '/node_modules'
    ]
  };

  debug('build installing');
  exports.install(path, function(err, data){
    if (err) return fn(err);
    debug('build reading', main);
    fs.readFile(main, 'utf8', function(err, str){
      if (err) return fn(err);
      debug('build rendering');
      exports.render(str, options, function(err, res){
        if (err) return fn(err);
        debug('build done');
        fn(null, res);
      });
    });
  });
};
