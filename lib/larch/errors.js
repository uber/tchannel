var TypedError = require('error/typed');

module.exports.ManyErrors = ManyErrors;

var ManyErrors = TypedError({
    type: 'many.errors',
    message: "{count} errors. Example: {example}",
    count: null,
    example: null,
    errors: null
});

module.exports.resultArrayToError = resultArrayToError;

function resultArrayToError(items, type, message) {
    var errors = [];
    var i;
    for (i = 0; i < items.length; i++) {
        if (items[i].err) {
            errors.push(items[i].err);
        }
    }

    if (errors.length === 0) {
        return null;
    }

    else if (errors.length === 1) {
        return errors[0];
    }

    else {
        return ManyErrors({
            message: message,
            type: type,
            errors: errors,
            count: errors.length,
            example: errors[0].message
        });
    }
}
