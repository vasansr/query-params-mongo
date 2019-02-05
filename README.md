# query-params-mongo
Converts HTTP URL query string parameters to MongoDB criteria, consisting of filter, sort, limit and skip parameters. The query string parameters follow a very easy-to-understand and easy-to-implement convention.

This can be used to handle REST API queries, or even regular GETs returning HTML pages that deal with a filtered and paginated display of the contents of a collection as a table.

## Quick Example
A request of the form:
```
/api/v1/employees?name=John&age__lte=45&category__in=A,B&__limit=10&__sort=-age
```
Is translated to:
```javascript
{
  filter: {
    name: 'John',
    age: {$lte: 45},
    category: {$in: ['A','B']},
  },
  sort: {
    age: -1
  },
  limit: 10,
  offset: 0
}
```
Where the filter and sort can be directly used as a MongoDB query filter and sort specification.

## Installation
    $ npm install query-params-mongo

## Usage
### Example
```javascript
var qpm = require('query-params-mongo');
var mongodb = require('mongodb');

var processQuery = qpm({
    autoDetect: [{ fieldPattern: /_id$/, dataType: 'objectId' }],
    converters: {objectId: mongodb.ObjectID}
});
...
app.get('/api/v1/employees', function(req, res) {
    try {
        var query = processQuery(req.query,
            {name: {dataType: 'string', required: false}},
            true
        );
    } catch (errors) {
        res.status(500).send(errors);
    }

    mongodb.MongoClient.connect('mongodb://localhost:27017/mydb', function(err, db) {
        var cursor = db.collection('employees').find(query.filter)
                .sort(query.sort).skip(query.offset).limit(query.limit);
        ...
    });
});

```
### API Reference
#### Create a Processor
```javascript
var qpm = require('query-params-mongo');
var processQuery = qpm(options)
```
To start off, we need to create a processor (a function) that can process the request query.
You can create as many processors as you like, but typically, your app will use only one.
The behaviour of the processor can be controlled using the options supplied to the creator function.

##### options:
* **autoDetect**: An array of custom data-types that can be auto-detected, over and above the native data-types supported. Each auto-detect spec has the following properties:
   * **valuePattern**: A regex pattern. If the value matches this pattern, it is detected as the given data-type.
   * **fieldPattern**: A regex pattern. If the field name matches this pattern, it is detected as the given data-type.
   * **dataType**: the data-type identifier, this can be a native data-type or a custom data-type.

   At least one of fieldPattern and valuePattern must be specified. If both are specified, the valuePattern is tested first. To get the opposite behaviour, define it as two separate auto-detect specs, with the fieldPattern spec preceding the valuePattern one. The first spec in the array that matches will be used.

* **converters**: A dictionary of non-native (custom) data-type converters.
   * **key**: string identifier of the data-type
   * **value**: a function to which a value string needing conversion is passed, returning the converted value, or undefined if the value could not be converted.

The auto-detect specs and the converters are added to a built-in set of auto-detect specs and
converters, which work on the native data types. Native data-types are
`string`, `int`, `float`, `bool` and `date`.
Whereas converters can be overridden (like using a custom converter to replace the built-in
converter for the `data` data-type), auto-detects cannot be overridden. Custom auto-detects
will take precedence over the built-in ones, though. The best way to assuredly specify the
data-type of a field is to specify it in the field specs.

#### Process a Query
```javascript
var q = processQuery(query, fieldSpec, strict)
```

* **query**: Request Query object. Note that this is not the query string, it is instead the *parsed* query object, the same that can be found in the req.query object of [express](http://expressjs.com/4x/api.html#req.query). If you have only the query-string, you could parse it using node's built-in querystring.parse() function to get the parsed request query object.
* **fieldSpec** (Optional) Dictionary describing the fields, especially the data types of each field.
   * **key**: field name
   * **value**: An object with the following properties:
      * **dataType**: the data type identifier.
      * **required**: true/false
* **strict** (Optional) Boolean value to indicate whether to consider the fieldSpec as a complete spec, i.e., if field names not specified in the fieldSpec are encountered, it will be considered an error. Defaults to false.

In cases where the client is not a controlled one, e.g., you are publishing a REST API for someone else's consumption, you would typically specify the complete fieldSpec and set strict to true. This will ensure that the caller is notified of errors due to possible typos in their field names.

If the client is your own, e.g., your own application, you may be confident that there are no typos in the field names in the query string. In this case, you may prefer the convenience of auto-detect over formal fields specification. In this case, the field spec can contain only the fields that cannot be auto-detected. But be warned that adding a filter on a non-existent field (caused by typos) will typically match no records.

#### Return Value
The result of `processQuery()` is an object with the following fields:

* `filter`: A MonboDB filter specification, suitable for passing to the `find()` method of `collection`.
* `sort`: A MongoDB sort specification, suitable for passing to the `sort()` method of `cursor`.
* `offset`: An integer, typically used for passing to the `skip()` method of `cursor`.
* `limit`: An integer, typically used for passing to the `limit()` method of `cursor`.

## Query Format
The query format is designed to be simple for simple use-cases, as well as completely readable in
the browser's URL (i.e, contains no characters that will need URL encoding). If you have an HTML
form, it is very likely that the query-string created out of this form's submission can be directly
processed.

The query format follows these rules:
* All query parameters *not* starting with a double underscore ('__') are assumed to be field names
* Special query parameters __sort, __limit and __offset are treated specially, and these indicate the sort spec, the limit of the output and the offset (skip) criteria for the Mongo query.
* Any other query parameter that starts with a double underscore is ignored. You may use these for special handling that is not covered by this module.

### Operators
In the most simplistic form, `<field>=<value>` in the query translates to an equals filter, for example `name=John` translates to a `{name: 'John'}` query filter specification.

To use other operators instead of the default equals operator, the operator specification is joined with the field name using double-underscores. For example, `age__lt=50` translates to `{age: {$lt: '50'}}`. An `eq` operator can be forced as in `name__eq=John` in the previous example for clarity, but it adds no special value.

Supported operators which have the same meaning as the MongoDB Query operators are:  
`eq, ne, gt, gte, lt, lte, in, nin, all, exists`

Other special operators supported are:  
`sw, swin, isw, iswin` : starts-with, starts-with-in (multiple values), ignore-case variants of the same  
`co, coin, ico, icoin` : contains, contains-in (multiple values), ignore-case variants  
`re, rein, ire, irein` : regular-expression, regular-expression in (mutliple values), ignore-case variants  
`eqa`: equals-array

### Values
The value is converted to an array by splitting it on a comma, if the operator
indicates that it requires mulitple values (all `in` operators, the `all` operator and
the `eqa` operator).

If multiple values are given for the same field, the value is considered an array,
regardless of the operator type.

Values are parsed and converted to an appropriate data-type, which could be auto-detected
or explicitly specified in the field spec.

### Examples
In the examples below, the original query string is shown rather than the parsed query object.
This is for readability, do ensure that the querystring is parsed before passing to processQuery.

#### Simple fields
* `name=John` -> `{name: 'John'}` Simple equality operator.
* `age__lt=50&age__gt=10` -> `{age: {$lt: 50, $gt: 10}}` Multiple conditions on same field.

#### Effect of Data Type
* `age__lt=50, {age: {dataType: 'string'}}` -> `{age: {$lt: '50'}}` Explicitly specified data-type overrides the auto-detected data-type.

#### Multiple values
* `priority=P1,P2` -> `{priority: 'P1,P2'}` This is probably not what you want.
* `priority__in=P1,P2` -> `{priority: {$in: ['P1','P2']}}` The in operator caused the value to be split on comma.
* `priority__in=P1&priority__in=P2` -> `{priority: {$in: ['P1','P2']}}` This is another way of specifying multiple values.
* `priority=P1&priority=P2` -> `{priority: ['P1','P2']}` Probably not what you want, unless priority is an array field and you need an exact comparison.

#### Array fields
Array fields are treated no different from regular fields, as the processor does not know about Array fields. The operator and/or explicitly specified multiple values affects the formation of the filter, so the following examples give you a hint of what you should be doing, assuming `tags` is an array field in the MongoDB collection.

* `tags=javascript` -> `{tags: 'javascript'}` One of the tags is 'javascript', that's how MongoDB interprets this filter.
* `tags__in=javascript` -> `{tags: {$in: ['javascript']}}`, Same effect as the previous example, but a lot more explicit.
* `tags__in=javascript,ecmascript` -> `{tags: {$in: ['javascript', 'ecmascript']}}` Matches if tags contains either of the values.
* `tags=javascript,ecmascript` -> `{tags: 'javascript,ecmascript'}`  This is not what is intended, which is why explicitly using `__in` is required, when comma separated multiple values are expected.
* `tags=javascript&tags=ecmascript` -> `{tags: ['javascript','ecmascript']}`  This is an exact array match, the value of tags must be exactly the two-element array.
* `tags__eqa=javascript,ecmascript` -> `{tags: ['javascript','ecmascript']}` The eqa operator keeps the MongoDB operator as eq, but forces a comma-split on the value. This is another way of specifying an exact array match, but more convenient.
* `tags__all=javascript,ecmascript` -> `{tags: {$all: ['javascript','ecmascript']}}` The value of tags must contain both the values.

### Special Parameters

#### __sort
Name(s) of field(s) to sort the result on. By default, the sort is in an ascending order. To specify
descending order, prefix the name of the field with `-`. Multiple sort values can be specified as
comma-separated values (`__sort=name,-age`) or multiple values (`__sort=name&__sort=-age`).

#### __offset
Specifies the offset into the list, is directly converted to the `skip` property in the return value.

#### __limit
Specifies the number of documents to limit the result, is directly converted to the `limit` property in the return value.

### HTML Forms
The query format is designed in a manner such that there is no additional javascript processing
required at the time of a form submission.

```html
<form>
  <label>Minimum age: </label>
  <input name='age__gte' type='text' value='10'>
  <label>Priority: </label>
  <select name='priority'>
    <option selected>P1</option>
    <option>P2</option>
    <option>P3</option>
  </select>
  <label>Status: </label>
  <select name='status__in' multiple>
    <option selected>New</option>
    <option selected>Open</option>
    <option>Closed</option>
  </select>
  <label>Severity: </label>
  <select name='severity__in'>
    <option>Critical</option>
    <option selected value='Critical,High'>High and above</option>
    <option value='Critical,High,Med'>Medium and above</option>
    <option value='Critical,High,Med,Low'>Low and above</option>
  </select>
  <input type='submit' value='Submit'>
</form>
```

When submitted, the above form will result in a query string like this:
```
age_gte=10&priority=P1&status__in=New&status__in=Open&severity__in=Critical,High
```

### Using AngularJS
In AngularJS, it is customary to use two-way binding of form inputs to scope variables.
In this case also, the processing required for generating the query string is very
minimal.

HTML:
```html
<form>
  <label>Minimum age: </label>
  <input ng-model='params.age__gte' type='text' value='10'>
  <label>Priority: </label>
  <select ng-model='params.priority'>
    <option selected>P1</option>
    <option>P2</option>
    <option>P3</option>
  </select>
  <label>Status: </label>
  <select ng-model='params.status__in' multiple>
    <option selected>New</option>
    <option selected>Open</option>
    <option>Closed</option>
  </select>
  <label>Severity: </label>
  <select ng-model='params.severity__in'>
    <option>Critical</option>
    <option selected value='Critical,High'>High and above</option>
    <option value='Critical,High,Med'>Medium and above</option>
    <option value='Critical,High,Med,Low'>Low and above</option>
  </select>
  <button ng-click='submit()'>Submit</submit>
</form>
```

As compared to a conventional form, you can see that name is now replaced by ng-model.
Also, there is a `params.` prefix to the field names so that the form values are stored
as properties of a variable named `params` in the scope -- just for convenience, as you
will see below in a sample submit() function.

```javascript
$scope.submit = function() {
	$http.get("/api/v1/employees", {params: $scope.params}).then(function(response) {
		$scope.employees = response.data;
		// the rest is angular magic
	});
}
```

## Limitations
### Nesting AND inside OR conditions
The filter is intended to be simplistic, and is an *and* combination of each individual query parameter filter. *Or* is indirectly supported via the `in` operator and variants, but a higher level *or* combination of comparisons of the form `(age > 30 || num_years < 3)` is not supported.

In most cases, this limitation is acceptable. In cases where this is not,
a workaround is to call your API twice, once with each part of the *or*
condition and combine the results in the client.

Future versions of the module may support this by adding a prefix/suffix to all fields that
constitute one sub-clause of an *or* condition like so:

`age__gt=30&age__lt=40&.1__num_years__gt=3&.1__num_years__lt=5`, which will result in
`(age > 30 && age < 40) || (num_years > 3 && num_years < 5)`

### Fields to return
The list of fields to be returned cannot be specified. The parameter __fields
is reserved for this purpose, and future versions may use this as required.

### Field names with double-underscore
Since the double-underscore is a special sequence used for separating the field name
and the operator, we won't be able to handle field names that really have __ in them.
Future versions may do some escaping to be able to handle this.
