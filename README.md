# query-params-mongo
Converts HTTP URL query string parameters to MongoDB criteria, consisting of filter, sort, limit and skip parameters. The query string parameters are expected to follow a certain easy-to-understand and easy-to-implement conventions.

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
    converters: {objectId: mongodb.ObjectID},
    autoDetect: [{ fieldPattern: /_id/, dataType: 'objectId' }]
});
...
app.get('/api/v1/employees', function(request, response) {
    try {
        var query = processQuery(request.query, 
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
}
```
### API
#### Create a Processor
```javascript
var processQuery = qpm(options)
```
##### options:
* **autoDetect**: An array of custom data-types that can be auto-detected, over and above the native data-types supported. Each auto-detect spec has the following properties:
   * **valuePattern**: A regex pattern. If the value matches this pattern, it is detected as the given data-type.
   * **fieldPattern**: A regex pattern. If the field name matches this pattern, it is detected as the given data-type.
   * **dataType**: the data-type identifier, this can be a native data-type or a custom data-type.

   At least one of fieldPattern and valuePattern must be specified. If both are specified, the valuePattern is tested first. To get the opposite behaviour, define two patterns, with the fieldPattern preceding the valuePattern spec, as the first spec in the array that matches will be used.

* **converters**: A dictionary of non-native (custom) data-type converters. 
   * **key**: string identifier of the datatype and the value 
   * **value**: a function to which a value string is passed, returning the converted value, or undefined if the value could not be converted.

The auto-detect specs and the converters are added to a built-in set of auto-detect specs and converters, which work on the native data types. Native data-types are `string`, `int`, `float`, `bool` and `date`.

#### Process a Query
```javascript
var q = processQuery(query, fieldSpec, validate)
```

* **query**: Request Query object. Note that this is not the query string, it is instead the *parsed* query object, the same that can be found in the request.query object of express. If you have only the query-string, you could parse it using the querystring npm module to get the parsed request query object.
* **fieldSpec** (Optional) Dictionary describing the fields, especially the data types of each field.
   * key: field name
   * value: An object with the following properties:
      * dataType: the data type identifier.
      * required: true/false
* **strict** (Optional) Boolean value to indicate whether to consider the fieldSpec as a complete spec, ie, if field names not specified in the fieldSpec are encountered, it will be considered an error. Defaults to false.

In cases where the client is not a controlled one, e.g., you are publishing a REST API for someone else's consumption, you would typically specify the complete fieldSpec and set strict to true. This will ensure that the caller is notified of errors and typos in their field names.

If the client is your own, e.g., your own application, you may confident that there are no typos in the field spec and prefer the convenience of auto-detect over formal fields specification. In this case, the field spec can contain only the fields that cannot be auto-detected.

## Query format
* All query parameters *not* starting with a double underscore ('__') are assumed to be field names
* Special query parameters __sort, __limit and __offset are treated specially, and these indicate the sort spec, the limit of the output and the offset (skip) criteria for the Mongo query.
* Any other query parameter that starts with a double underscore is ignored. You may use these for special handling that is not covered by this module.

## Filter Parameters
#### Operators
In the most simplistic form, `<field>=<value>` in the query translates to an equals filter, for example `name=John` translates to a `{name: 'John'}` query filter specification.

To use other operators instead of the default equals operator, the operator specification is joined with the field name using double-underscores. For example, `age__lt=50` translates to `{age: {$lt: '50'}}`. An `eq` operator can be forced as in `name__eq=John` in the previous example for clarity, but it adds no special value.

Supported operators which have the same meaning as the MongoDB Query operators are:  
`eq, ne, gt, gte, lt, lte, in, nin, all, exists`

Other special operators supported are:  
`sw, swin`: starts-with, starts-with-in (multiple values)  
`isw, iswin`:  ignore-case variants of the above  
`co, coin`: contains, contains-in (multiple values)  
`ico, icoin`:  ignore-case variants of the above  
`re, rein`: regular-expression, regular-expression in (mutliple values)  
`ire, irein`:  ignore-case variants of the above  
`eqa`: equals-array

#### Values
The value is converted to an array by splitting it on a comma, if the operator indicates that it requires mulitple values (all `in` operators, the `all` operator and the `eqa` operator).

If multiple values are given for the same field, the value is retained as an array, regardless of the operator type.

Values are parsed and converted to an appropriate data type if required, which is determined by the Field Type, which could be auto-detected or explicitly specified in the field spec.

## Examples
In the examples below, the original query string is shown rather than the parsed query object. This is for convenience, do ensure that the querystring is parsed before passing to processQuery.

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

* `tags=javascript` -> `{tags: 'javascript'}` One of the tags is 'javascript', that's how Mongo interprets this filter.
* `tags__in=javascript` -> `{tags: {$in: ['javascript']}}`, Same effect as the previous example, but a lot more explicit.
* `tags__in=javascript,ecmascript` -> `{tags: {$in: ['javascript', 'ecmascript']}}`. Matches if tags contains either of the values.
* `tags=javascript&tags=ecmascript` -> `{tags: ['javascript','ecmascript']}`  This is an exact Array Match, the value of tags must be exactly the two-element array.
* `tags=javascript,ecmascript` -> `{tags: 'javascript,ecmascript'}`  This Not what is intended, which is why explicitly using `__in` is required, when comma separated multiple values are expected.
* `tags__eqa=javascript,ecmascript` -> `{tags: ['javascript','ecmascript']}` The eqa operator keeps the MongoDB operator as eq, but forces a comma-split on the value. Another way of specifying an exact match, more convenient.
* `tags_all=javascript,ecmascript` -> `{tags: {$all: ['javascript','ecmascript']}}` The value of tags must contain both the values.

## Limitations
The filter is intended to be simplistic, and is an *and* combination of each individual query parameter filter. *Or* is indirectly supported via the `in` operator and variants, but a higher level *or* combination of comparisons of the form age > 30 || num_years < 3 is not supported.

In most cases, this limitation is acceptable. In cases where this is not, a workaround is to call your API twice, once with each part of the *or* condition and combine the results in the client.

