/*
 * query-params-mongo
 *
 * Convert URL Query parameters to a Mongo db criteria. Typical usage is
 * to filter/sort a collection and display as a table.
 *
 * See test/sample.js for example usage.
 *
 */


var validOperators = ['eq','ne','gt','gte','lt','lte','in','nin','all','exists',
	'eqa',
	'sw','swin','isw','iswin','co','coin','ico','icoin','re','rein','ire','irein'];

function isMultiValOp(paramOp) {
	return (/in/.test(paramOp) || paramOp == 'all' || paramOp == 'eqa');
}

function regEscape(pattern) {
	if (pattern !== undefined) {
		return pattern.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
	}
}

var defaultAutoDetectTypes = [
	{ fieldPattern: /^is/, dataType: 'bool' },
	{ fieldPattern: /_date$/, dataType: 'date' },
	{ valuePattern: /^[0-9]+$/, dataType: 'int' } ,
	{ valuePattern: /^[0-9]*\.[0-9]+$/, dataType: 'float' } ,
	{ valuePattern: /^true|false|yes|no$/i, dataType: 'bool' } ,
	{ valuePattern: /^[0-9][0-9-: ]+$/, dataType: 'date' } ,
];

var defaultDataTypeConverters = {
	string: function(str) { return str; },
	int :   function(str) {var i = parseInt(str); return isNaN(i) ? undefined : i},
	float : function(str) {var i = parseFloat(str); return isNaN(i) ? undefined : i},
	date:   function(str) {var d = new Date(str); return isNaN(d.getTime()) ? undefined : d},
	bool:   function(str) {
		// no, false, 0 => false. Others, (including '', eg, for checkboxes) is considered true.
		return !/^n|^f/i.test(str) || str == '0';
	}
}

/*
 * The factory function that we export: this will be used to construct one
 * or more query processor functions based on the options passed in.
 */
module.exports = function qpm(opts) {

	if (!opts)
		opts = {};

	// user specified patterns take precedence, so add them before the default
	var autoDetectTypes = opts.autoDetect ? opts.autoDetect : [];
	for (var i=0; i<defaultAutoDetectTypes.length; i++) {
		autoDetectTypes.push(defaultAutoDetectTypes[i]);
	};

	var dataTypeConverters = defaultDataTypeConverters;
	if (opts.converters) {
		for (var type in opts.converters) {
			// this will overwrite any default data-type specs.
			dataTypeConverters[type] = opts.converters[type];
		}
	}

	/*
	 * The actual function that does all the work: this is what is returned
	 * when the factory method (the exported one) is called.
	 */
	return function processQuery(params, fields, validate) {

		if (!fields) fields = {};
		var errors = [];
		var filter = {};

		for (var paramSpec in params) {
			/*
			 * The parameters are like name__op=value, where __op is optional.
			 * name__op is the paramSpec. We ignore any paramSpec starting with __,
			 * these have special meaning, and are not a filter parameter.
			 */
			if (paramSpec.substr(0,2) == "__")
				continue;

			var paramParts = paramSpec.split('__');
			var paramName = paramParts[0];
			var paramOp;

			/*
			 * Determine and validate the operator, or default to eq
			 */
			if (paramParts.length > 1) {
				// We have an explicitly specified operator with the parameter
				paramOp = paramParts[1];
				if (validOperators.indexOf(paramOp) == -1) {
					errors.push("Invalid operator: " + paramOp);
					paramOp = 'eq';
				}
			} else {
				paramOp = 'eq';
			}

			/*
			 * Split a single value into an array of values if the operator is a multi-valued one.
			 * Also convert a single value to an array so that we can deal with it consistently,
			 * while further processing each value.
			 */
			var paramValues = params[paramSpec];
			if (!Array.isArray(paramValues)) {
				if (isMultiValOp(paramOp)) {
					// Split the paramValue on a comma, eg, country__in=US,UK
					paramValues = paramValues.split(',');
				} else {
					// make it an array with one element
					paramValues = [paramValues];
				}
			}

			/*
			 * Find the data type of the parameter/field. If we have to validate
			 */
			var dataType = 'string';
			if (fields[paramName]) {
				if (fields[paramName].dataType) {
					dataType = fields[paramName].dataType;
				}
			} else {
				if (validate) {
					errors.push("Missing field spec: " + paramName);
				}
				if (paramOp == 'exists') {
					dataType = 'bool';
				} else {
					for (var i=0; i<autoDetectTypes.length; i++) {
						var ad = autoDetectTypes[i];
						if ( (ad.valuePattern && ad.valuePattern.test(paramValues[0]))
							|| (ad.fieldPattern && ad.fieldPattern.test(paramName)) ) {
							dataType = ad.dataType;
							break;
						}
					}
				}
			}

			/*
			 * Data type conversions
			 */
			var converter = dataTypeConverters[dataType];
			try {
				paramValues = paramValues.map(converter);
			} catch (e) {
				paramValues = [undefined];
			}
			if (paramValues.some(function(v) {return v == undefined})) {
				errors.push("Error converting to " + dataType + ": " + params[paramSpec]);
			}

			/*
			 * Param operator to mongo operator conversion:
			 * 1. re/sw/co become eq after converting the RHS to a regexp
			 * 2. eqa becomes eq - no conversion required, the 'a' is only to
			 *    force a comma split of the value and keep it as an array.
			 * Others just prefix a $ to paramOp.
			 */
			var $op = '$eq';
			var reOptions = paramOp[0] == 'i' ? 'i' : '';

			if (/re/.test(paramOp)) {
				// convert paramValues to regex: simple
				paramValues = paramValues.map(function(v) {return RegExp(v, reOptions)});
				$op = (paramOp == 'rein') ? '$in' : '$eq';

			} else if (/sw/.test(paramOp)) {
				// convert paramValues to regex with a ^, escape regex special chars
				paramValues = paramValues.map(function(v) {
					return RegExp('^' + regEscape(v), reOptions)
				});
				$op = /in/.test(paramOp) ? '$in' : '$eq';

			} else if (/co/.test(paramOp)) {
				// convert paramValues to regex, escape regex special chars
				paramValues = paramValues.map(function(v) {
					return RegExp(regEscape(v), reOptions)
				});
				$op = /in/.test(paramOp) ? '$in' : '$eq';

			} else if (paramOp == 'eqa') {
				$op = '$eq';

			} else {
				$op = '$' + paramOp;
			}

			/*
			 * Form the filter, the operator tells us how to deal with the paramValues.
			 *
			 * If it contains more than one element, we keep it as an array. Or,
			 * if the operator is a multi-val operator, then too, we keep it as an array, even if
			 * it contains only one element. Otherwise, we use the only element as the value.
			 *
			 * $eq is treated specially since the RHS has to be the value. For all other
			 * operators, we need the operator specified explicitly.
			 */
			var value = (paramValues.length > 1 || isMultiValOp(paramOp))
				? paramValues
				: paramValues[0];

			if ($op == '$eq') {
				filter[paramName] = value;
			} else {
				filter[paramName] = filter[paramName] || {};	// same field may already be there
				filter[paramName][$op] = value;
			}
		}

		/*
		 * Required filter params validation
		 */
		for (fieldName in fields) {
			if (fields[fieldName].required) {
				if (filter[fieldName] == undefined) {
					errors.push("Missing required filter on field: ", fieldName);
				}
			}
		}

		/*
		 * Other non-filter parameters processing: sort, skip and limit
		 */
		var limit, offset;
		if (params.__limit) {
			limit = parseInt(params.__limit);
		}
		if (params.__offset) {
			offset = parseInt(params.__offset);
		}

		var sort;
		if (params.__sort) {
			sort = {};
			var sortSpecs = typeof params.__sort === 'string' ? params.__sort.split(',') : params.__sort;
			sortSpecs.forEach(function(s) {
				var direction = 1;
				var sortField = s;
				if (s.substr(0,1) == "-") {		// eg -age
					sortField = s.substr(1);
					direction = -1;
				}
				if (validate && !fields[sortField]) {
					errors.push("Invalid sort field: " + sortField);
				}
				sort[sortField] = direction;
			});
		}

		if (errors.length > 0)
			throw errors;

		return {filter: filter, sort: sort, limit: limit, offset: offset};
	}

}

