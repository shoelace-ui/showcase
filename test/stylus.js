var debug = require('debug')('showcase:test:stylus');
var should = require('should');
var stylus = require('../stylus');

describe('stylus', function(){
  process.stdout.write('\u001B[2J');

  this.timeout(0);

  describe.skip('.render', function(){
    it('should import aglet variables', function(done){
      stylus.render('foo {bar: body--bg}', {compress: true}, function(err, data){
        if (err) return done(err);
        data.should.endWith('inherit}');
        done();
      });
    });
  });

  describe.skip('.install', function(){
    it('should install a module', function(done){
      stylus.install('octanner/theme-tribute', function(err){
        if (err) return done(err);
        done();
      });
    });
  });

  describe('.build', function(){
    it('should build stylesheets', function(done){
      stylus('octanner', 'theme-tribute', 'master', '', {force: true}, done);
    });
  });
});
