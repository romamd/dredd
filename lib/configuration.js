const clone = require('clone');
const { EventEmitter } = require('events');

const logger = require('./logger');
const reporterOutputLogger = require('./reporters/reporterOutputLogger');


function coerceToArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  if (value == null) return [];
  return value;
}


function coerceToBoolean(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value) return true;
  return false;
}


function applyLoggingOptions(options) {
  if (options.color === false) {
    logger.transports.console.colorize = false;
    reporterOutputLogger.transports.console.colorize = false;
  }

  // Handling the 'loglevel' value
  if (options.loglevel) {
    const loglevel = options.loglevel.toLowerCase();
    if (loglevel === 'silent') {
      logger.transports.console.silent = true;
    } else if (loglevel === 'warning') {
      logger.transports.console.level = 'warn';
    } else if (loglevel === 'debug') {
      logger.transports.console.level = 'debug';
      logger.transports.console.timestamp = true;
    } else if (['warn', 'error'].includes(loglevel)) {
      logger.transports.console.level = loglevel;
    } else {
      logger.transports.console.level = 'warn';
      throw new Error(`The logging level '${loglevel}' is unsupported, `
        + 'supported are: silent, error, warning, debug');
    }
  } else {
    logger.transports.console.level = 'warn';
  }
}


function coerceRemovedOptions(config = {}) {
  const errors = [];
  const warnings = [];

  if (config.options) {
    if (config.options.c != null) {
      warnings.push('DEPRECATED: Dredd does not support '
        + '-c anymore, use --color/--no-color instead');
      config.options.color = coerceToBoolean(config.options.c);
      delete config.options.c;
    }
    if (typeof config.options.color === 'string') {
      warnings.push('DEPRECATED: Dredd does not support '
        + `--color=${config.options.color} anymore, use --color/--no-color instead`);
      config.options.color = coerceToBoolean(config.options.color);
    }
    if (config.options.level) {
      warnings.push('DEPRECATED: Dredd does not support '
        + '--level anymore, use --loglevel instead');
    }
    if (config.options.level || config.options.l) {
      const level = config.options.level || config.options.l;
      if (!['silent', 'error', 'warning', 'debug'].includes(level)) {
        warnings.push('DEPRECATED: Dredd does not support '
          + `'${level}' log level anymore, use 'silent', 'error', `
          + "'warning', or 'debug' instead");
      }
      let loglevel;
      if (['silly', 'debug', 'verbose'].includes(level)) {
        loglevel = 'debug';
      } else if (level === 'error') {
        loglevel = 'error';
      } else if (level === 'silent') {
        loglevel = 'silent';
      } else {
        loglevel = 'warn';
      }
      config.options.loglevel = loglevel;
      config.options.l = loglevel;
      delete config.options.level;
    }
    if (config.options.timestamp || config.options.t) {
      warnings.push('DEPRECATED: Dredd does not support '
        + '--timestamp anymore, use --loglevel=debug instead');
      config.options.loglevel = 'debug';
      config.options.l = 'debug';
      delete config.options.timestamp;
      delete config.options.t;
    }
    if (config.options.silent || config.options.q) {
      warnings.push('DEPRECATED: Dredd does not support '
        + '-q/--silent anymore, use --loglevel=silent instead');
      config.options.loglevel = 'silent';
      config.options.l = 'silent';
      delete config.options.silent;
      delete config.options.q;
    }
    if (config.options.sandbox || config.options.b) {
      errors.push('REMOVED: Dredd does not support '
        + 'sandboxed JS hooks anymore, use standard JS hooks instead');
      delete config.options.sandbox;
      delete config.options.b;
    }
  }
  if (config.hooksData) {
    errors.push('REMOVED: Dredd does not support '
      + 'sandboxed JS hooks anymore, use standard JS hooks instead');
    delete config.hooksData;
  }
  if (config.blueprintPath) {
    warnings.push('DEPRECATED: Dredd does not support '
      + "the 'blueprintPath' option anymore, use 'path' instead");
    config.options = config.options || {};
    config.options.path = [].concat([config.blueprintPath], coerceToArray(config.options.path));
    delete config.blueprintPath;
  }

  return { errors, warnings };
}


function applyConfiguration(inConfig) {
  const outConfig = {
    server: null,
    emitter: new EventEmitter(),
    registerHooks: null,
    custom: { // Used for custom settings of various APIs or reporters
      // Keep commented-out, so these values are actually set by CLI
      // cwd: process.cwd()
    },
    options: {
      'dry-run': false,
      reporter: null,
      output: null,
      header: null,
      user: null,
      'inline-errors': false,
      details: false,
      method: [],
      only: [],
      color: true,
      loglevel: 'warning',
      sorted: false,
      names: false,
      hookfiles: null,
      language: 'nodejs',
      'hooks-worker-timeout': 5000,
      'hooks-worker-connect-timeout': 1500,
      'hooks-worker-connect-retry': 500,
      'hooks-worker-after-connect-wait': 100,
      'hooks-worker-term-timeout': 5000,
      'hooks-worker-term-retry': 500,
      'hooks-worker-handler-host': '127.0.0.1',
      'hooks-worker-handler-port': 61321,
    },
  };

  // Gracefully deal with the removed options
  const coerceResult = coerceRemovedOptions(inConfig);

  // Apply the values from the coerced config over the default ones
  const custom = inConfig.custom || {};
  Object.keys(custom)
    .forEach((key) => { outConfig.custom[key] = clone(custom[key], false); });

  const options = inConfig.options || {};
  Object.keys(options)
    .forEach((key) => { outConfig.options[key] = options[key]; });

  Object.keys(inConfig)
    .filter(key => !['custom', 'options'].includes(key))
    .forEach((key) => { outConfig[key] = inConfig[key]; });

  // Coerce single/multiple options into an array
  outConfig.options.reporter = coerceToArray(outConfig.options.reporter);
  outConfig.options.output = coerceToArray(outConfig.options.output);
  outConfig.options.header = coerceToArray(outConfig.options.header);
  outConfig.options.method = coerceToArray(outConfig.options.method);
  outConfig.options.only = coerceToArray(outConfig.options.only);
  outConfig.options.path = coerceToArray(outConfig.options.path);

  outConfig.options.method = outConfig.options.method
    .map(method => method.toUpperCase());

  if (outConfig.options.user) {
    const token = Buffer.from(outConfig.options.user).toString('base64');
    outConfig.options.header.push(`Authorization: Basic ${token}`);
    delete outConfig.options.user;
  }

  applyLoggingOptions(outConfig.options);

  // Log accumulated errors and warnings
  coerceResult.errors.forEach(message => logger.error(message));
  coerceResult.warnings.forEach(message => logger.warn(message));

  // Abort Dredd if there has been any errors
  if (coerceResult.errors.length) {
    throw new Error('Could not configure Dredd');
  }

  return outConfig;
}


module.exports = {
  applyConfiguration,
  applyLoggingOptions,

  // only for the purpose of unit tests
  _coerceRemovedOptions: coerceRemovedOptions,
};
