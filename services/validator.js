const validator = require('validator');
// const R = require('ramda');
const debug = require('debug')('zcare:utilities:validate');
const moment = require('moment');
const Validate = exports;
const TIME_FORMAT = 'HH:mm'
const DATE_FORMAT = 'YYYY-MM-DD';
const DATE_TIME_FORMAT = `${DATE_FORMAT} ${TIME_FORMAT}`;
function InvalidValueError(message) {
  this.message = message;
  this.name = 'InvalidValueError';
  Error.captureStackTrace(this, InvalidValueError);
}

InvalidValueError.prepend = function(message, error, key) {
  if (error instanceof InvalidValueError) {
    return new InvalidValueError(message + ': ' + error.message);
  }
  return error;
};

Validate.InvalidValueError = InvalidValueError;

Validate.acceptAll = function(value) {
  return value;
};

Validate.optional = function(validator) {
  return function(value) {
    return (value === undefined || value === null) ? value : validator(value);
  };
};

Validate.that = function(predicate, message) {
  return function(value) {
    if (predicate(value)) return value;
    throw new InvalidValueError(message);
  };
};

Validate.number = Validate.that(function(value) {
  return typeof value === 'number';
}, 'not a number');

Validate.string = Validate.that(function(value) {
  return typeof value === 'string';
}, 'not a string');

Validate.object = function(propertyValidators) {
  return function(object) {
    let result = {};
    let key;
    let valid;
    if (!object || typeof object !== 'object') {
      throw new InvalidValueError('not an Object');
    }
    // Validate all properties.
    for (key in propertyValidators) {
      let validator = propertyValidators[key];
      try {
          valid = validator(object[key]);
      } catch (error) {
        if (key in object) {
            throw InvalidValueError.prepend('in property "' + key + '"', error);
        } else {
            throw new InvalidValueError('missing property "' + key + '"');
        }
      }
      if (key in object && valid !== undefined) {
          result[key] = valid;
      }
    }

    // Check for unexpected properties.
    for (key in object) {
      if (!propertyValidators[key]) {
        throw new InvalidValueError('unexpected property "' + key + '"');
      }
    }

    return result;
  };
};

Validate.array = function(validator) {
  return function(array) {
    let result = [];

    if (Object.prototype.toString.call(array) !== '[object Array]') {
      throw new InvalidValueError('not an Array');
    }

    for (let i = 0; i < array.length; ++i) {
      try {
        result[i] = validator(array[i]);
      } catch (error) {
        throw InvalidValueError.prepend('at index ' + i, error);
      }
    }

    return result;
  };
};

Validate.oneOf = function(names) {
  let myObject = {};
  let quotedNames = [];
  names.forEach(function(name) {
    myObject[name] = true;
    quotedNames.push('"' + name + '"');
  });

  return function(value) {
    if (myObject[value]) return value;
    throw new InvalidValueError('not one of ' + quotedNames.join(', '));
  };
};

Validate.mutuallyExclusiveProperties = function(names) {
  return function(value) {
    if (!value) return value;

    let present = [];
    names.forEach(function(name) {
      if (name in value) {
        present.push('"' + name + '"');
      }
    });

    if (present.length > 1) {
      throw new InvalidValueError(
          'cannot specify properties '
          + present.slice(0, -1).join(', ')
          + ' and '
          + present.slice(-1)
          + ' together');
    }

    return value;
  };
};

Validate.compose = function(validators) {
  return function(value) {
    validators.forEach(function(validate) {
      value = validate(value);
    });
    return value;
  };
};

Validate.boolean = Validate.compose([
  Validate.that(function(value) {
    return typeof value === 'boolean';
  }, 'not a boolean'),
  function(value) {
    // In each API, boolean fields default to false, and the presence of
    // a querystring value indicates true, so we omit the value if
    // explicitly set to false.
    return value ? value : undefined;
  }
]);

Validate.atLeastOneOfProperties = (names) => {
  return function(value) {
      if (!value) return value;

      let present = [];
      names.forEach(function(name) {
          if (name in value) {
              present.push('"' + name + '"');
          }
      });

      if (present.length == 0) {
          throw new InvalidValueError(`specify at least one of properties "${names.slice(0, -1).join(', "')}" and "${names.slice(-1)}"`)
      }

      return value;
  };
};

Validate.mongoId = Validate.that(value => validator.isMongoId(value), 'not a mongoId');

Validate.lowercase = Validate.that(value => validator.isLowercase(value), 'not a lowercase');

Validate.uppercase = Validate.that(value => validator.isUppercase(value), 'not a uppercase');

Validate.numeric = Validate.that(value => validator.isNumeric(value), 'not numeric');

Validate.email = Validate.that(value =>  {
  return validator.isEmail(value);
}, 'not an email');

Validate.phone = (format) => (value => validator.isMobilePhone(value, format || process.env.MOBILE_FORMAT));

Validate.emailNormalized =  Validate.compose([
  Validate.email, 
  Validate.that(value => validator.normalizeEmail(value) === value, 'is not normalized email')
]);

Validate.isNotEmpty =  Validate.that(value => !validator.isEmpty(value), 'is empty')

Validate.dateString = Validate.compose([
  Validate.string,
  Validate.that(value => {
    return moment(value, DATE_FORMAT).isValid()
  }, 'is not a date time')
])


Validate.timeString = Validate.compose([
  Validate.string,
  Validate.that(value => {
    return moment(value, TIME_FORMAT).isValid()
  }, 'is not a valid time')
])


Validate.dateTimeString = Validate.compose([
  Validate.string,
  Validate.that(value => {
    return moment(value, DATE_TIME_FORMAT).isValid()
  }, 'is not valid date')
])

Validate.dateOfBirth = Validate.compose([
  Validate.object({
    day: Validate.number,
    month: Validate.number,
    year: Validate.number,
  }),
  Validate.that(payload => {
    const dateOfBirthMoment = moment([
      payload.year,
      payload.month-1, //because moment month is 0 index based
      payload.day,
    ]);
    return dateOfBirthMoment.isValid();
  }, 'not a valid date')
])

Validate.length = (expectedLength) => {
  return Validate.that(value => {
    return value.length === expectedLength;
  }, `doesn't match expected length ${expectedLength}`);
}

// Validate.weekDaysNumbers = Validate.compose([
//   Validate.array(Validate.number),
//   Validate.that(value => {
//     return value.length <= 7 && value.length >= 0
//   }, 'not more than 7 days'),
//   Validate.that(value => {
//     return value.every(v => {
//       return v > 0 && v < 8
//     })
//   }, 'value out of week range'),
//   Validate.that(value => R.uniq(value).length === value.length, 'not uniq, days repeated')
// ])