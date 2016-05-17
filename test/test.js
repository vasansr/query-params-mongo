var assert = require("chai").assert;
var should = require("chai").should();
var qs = require('querystring');
var qpm = require('../index.js');

var processQuery = qpm();

describe("All Tests", function () {
	describe("Single value filters and data types", function() {
		var query = 'name=John'						// simple equality, string
			+ '&age__lte=50&age__gte=10'			// multiple checks on same field, int type
			+ '&priority=4'							// force string comparison for int
			+ '&testing=true'						// boolean auto-detect
			+ '&is_complete=1'						// boolean auto-detect, using field name
			+ '&d=2015-09-30'						// date auto-detect
		;

		var result = processQuery(qs.parse(query), {priority: {dataType: 'string'}});
		it("should parse successfully", function() {
			assert.ok(result.filter);
		});

		var filter = result.filter;

		it("should create equals operator", function() {
			filter.should.have.property('name').and.equal('John');
		});
		it("should add multiple checks on same field", function() {
			filter.should.have.property('age').and.deep.equal({$lte: 50, $gte: 10});
		});
		it("should force data-type when specified", function() {
			filter.should.have.property('priority').and.equal('4');
		});
		it("should detect boolean type on value", function() {
			filter.should.have.property('testing').and.be.true;
		});
		it("should detect boolean type on name", function() {
			filter.should.have.property('is_complete').and.be.true;
		});
		it("should detect date type on value", function() {
			filter.should.have.property('d').and.be.a('Date');
		});
	});

	describe("Other common operators", function() {
		var query = 'notinvar__nin=N'			// nin
			+ '&subdoc.existsvar__exists=y'		// testing for exists within a sub-doc
			+ '&swvar__sw=beginning'			// starts-with should become a regex
			+ '&swesc__sw=beg[]'				// starts-with escape special chars
			+ '&covar__co=middle'				// contains should become a regex
			+ '&coinvar__coin=mid,middle'		// contains multiple
			+ '&icovar__ico=imid'				// contains ignore-case
		;

		var result = processQuery(qs.parse(query));
		it("should parse successfully", function() {
			assert.ok(result.filter);
		});
		var filter = result.filter;

		it("should create $nin operator as array", function() {
			filter.should.have.property('notinvar').and.deep.equal({$nin : ['N']});
		});
		it("should create $exists operator", function() {
			filter.should.have.property('subdoc.existsvar').and.deep.equal({$exists : true});
		});
		it("should create equals operator with regex for sw", function() {
			filter.should.have.property('swvar').and.deep.equal(/^beginning/);
		});
		it("should escape regex special chars sw", function() {
			filter.should.have.property('swesc').and.deep.equal(/^beg\[\]/);
		});
		it("should create equals operator with regex for co", function() {
			filter.should.have.property('covar').and.deep.equal(/middle/);
		});
		it("should create in operator with regex for coin", function() {
			filter.should.have.property('coinvar').and.deep.equal({$in: [/mid/,/middle/]});
		});
		it("should create regex with ignore case for ico", function() {
			filter.should.have.property('icovar').and.deep.equal(/imid/i);
		});

	});

	describe("Multi-valued operators", function() {
		var query = 'priority=P1,P2'				// comma is part of value
			+ '&priorityM__in=P1,P2'				// in operator splits the value on comma
			+ '&priorityA__in=P1&priorityA__in=P2'	// true mv, with in operator
			+ '&priorityE=P1&priorityE=P2'			// true mv, with eq operator
			+ '&priorityEqa__eqa=P1,P2'				// comma sep mv, with eqa operator
			+ '&priorityAll__all=P1,P2'				// comma sep mv with all operator
		;

		var result = processQuery(qs.parse(query));
		it("should parse successfully", function() {
			assert.ok(result.filter);
		});
		var filter = result.filter;

		it("should not split comma for equals operator", function() {
			filter.should.have.property('priority').and.equal('P1,P2');
		});
		it("should comma split for in operator", function() {
			filter.should.have.property('priorityM').and.deep.equal({$in: ['P1','P2']});
		});
		it("should comma split eqa operator", function() {
			filter.should.have.property('priorityEqa').and.deep.equal(['P1','P2']);
		});
		it("should comma split all operator", function() {
			filter.should.have.property('priorityAll').and.deep.equal({$all: ['P1','P2']});
		});
		it("should use natural multi-val as array for in operator", function() {
			filter.should.have.property('priorityA').and.deep.equal({$in: ['P1','P2']});
		});
		it("should use natural multi-val as array for equals operator", function() {
			filter.should.have.property('priorityE').and.deep.equal(['P1','P2']);
		});
	});

	describe("Custom types and overriding auto-detect", function() {

		var customProcess = qpm({
			converters: {
				'name-age': function(str) {
					var parts = str.split('!');
					return {name: parts[0], age: parseInt(parts[1])};
				}
			},
			autoDetect: [
				{ valuePattern: /[a-zA-Z]+![0-9]+$/, dataType: 'name-age' },
				{ fieldPattern: /^is/, dataType: 'string' },		// override builtin
			]
		});

		var query = 'nameagevar=John!25'			// Custom converter and auto-detect
			+ '&issue=none'							// override builtin is field name auto-detect
		;

		var result = customProcess(qs.parse(query));
		it("should parse successfully", function() {
			assert.ok(result.filter);
		});
		var filter = result.filter;

		it("should parse name-age value", function() {
			filter.should.have.property('nameagevar').and.deep.equal({name: 'John', age: 25});
		});

		it("should not consider issue as boolean", function() {
			filter.should.have.property('issue').and.equal('none');
		});

	});

	describe("Special and ignored fields", function() {
		var query = 'name=John'
			+ '&age__lte=50&age__gte=10'			// bunch of filter fields
			+ '&__sort=name,-age'					// multiple sort, one ascending other desc
			+ '&__limit=10&__offset=20'				// limit and offset
			+ '&__ignored_field'					// don't process this field
		;

		var result = processQuery(qs.parse(query));
		it("should parse successfully", function() {
			assert.ok(result);
		});

		it("filter should only contain filter fields", function() {
			result.filter.should.deep.equal({name: 'John', age: {$lte: 50, $gte: 10}});
		});
		it("sort should be parsed", function() {
			result.sort.should.deep.equal({name: 1, age: -1});
		});
		it("limit should be parsed", function() {
			result.limit.should.equal(10);
		});
		it("offset should be parsed", function() {
			result.offset.should.equal(20);
		});
	});

	describe("Special case: --", function() {
		var query = 'name__swin=--,John' ;

		var result = processQuery(qs.parse(query));
		it("should parse successfully", function() {
			assert.ok(result);
		});
	});
});

