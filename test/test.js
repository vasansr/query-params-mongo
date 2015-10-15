var qs = require('querystring');
var util = require('util');

var qpm = require('../index.js');
var processQuery = qpm({
	converters: {objectId: require('mongodb').ObjectID},
	autoDetect: [{ fieldPattern: /_id$/, dataType: 'objectId' }]
});

var qstring = 
	   'name=John'						// simple equality
	+ '&age__lte=50'					// other simple operator
	+ '&age__gte=10'					// multiple checks on same field
	+ '&num_years=3'					// auto-detect field-type
	+ '&priority__in=P1,P2'				// comma separated multi-val
	+ '&pri__in=1&pri__in=2'			// Array multi-val
	+ '&tag__in=ecma'					// Forced array for single value
	+ '&tags__eqa=java,ecma'			// comma separated multival for eqa
	+ '&_id=559ebbf3c6d7c9103854092d'	// ObjectId

	+ '&__limit=10&__offset=10'			// non-filter parameters: standard ones
	+ '&__sort=-age,name'

	+ '&__special_param=val'			// other params that makeQuery ignores

var params = qs.parse(qstring);

var fields = {
	age: {dataType: 'int' },
	priority: {required: true },
}

try {
	var q = processQuery(params, fields);
} catch (err) {
	console.log("Validation failed: ", err);
}

console.log(util.inspect(q, false, null));


