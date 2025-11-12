// middleware/validate.js
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, coerceTypes: true, removeAdditional: 'all' });
addFormats(ajv);

// Simple cache keyed by schema JSON to reuse compiled validators
const validatorCache = new Map();

/**
 * createValidator(schema, { source = 'body' })
 * - schema: JSON Schema object
 * - source: 'body' | 'params' | 'query'
 * Returns Express middleware that validates req[source]
 */
function createValidator(schema, { source = 'body' } = {}) {
  const key = `${source}:${JSON.stringify(schema)}`;

  if (!validatorCache.has(key)) {
    const validate = ajv.compile(schema);
    validatorCache.set(key, validate);
  }

  const validate = validatorCache.get(key);

  return (req, res, next) => {
    const data = req[source];

    const valid = validate(data);
    if (valid) return next();

    // Format Ajv errors into a friendly response
    const details = (validate.errors || []).map(err => ({
      path: err.instancePath || err.dataPath || '',
      message: err.message,
      keyword: err.keyword,
      params: err.params
    }));

    return res.status(400).json({
      error: 'validation_failed',
      source,
      details
    });
  };
}

module.exports = { createValidator };
