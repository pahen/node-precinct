var getModuleType = require('module-definition');
var debug = require('debug')('precinct');
var Walker = require('node-source-walk');

var detectiveCjs = require('detective-cjs');
var detectiveAmd = require('detective-amd');
var detectiveEs6 = require('detective-es6');
var detectiveSass = require('detective-sass');
var detectiveStylus = require('detective-stylus');

var fs = require('fs');
var path = require('path');

var natives = process.binding('natives');

/**
 * Finds the list of dependencies for the given file
 *
 * @param {String|Object} content - File's content or AST
 * @param {Object} [options]
 * @param {String} [options.type] - The type of content being passed in. Useful if you want to use a non-js detective
 * @return {String[]}
 */
function precinct(content, options) {
  options = options || {};
  var dependencies = [];
  var ast;
  var type = options.type;

  // Legacy form backCompat where type was the second parameter
  if (typeof options === 'string') {
    type = options;
    options = {};
  }

  // We assume we're dealing with a JS file
  if (!type && typeof content !== 'object') {
    var walker = new Walker();

    try {
      // Parse once and distribute the AST to all detectives
      ast = walker.parse(content, walker.options);
      precinct.ast = ast;
    } catch (e) {
      // In case a previous call had it populated
      precinct.ast = null;
      debug('could not parse content: %s', e.message);
      return dependencies;
    }
  // SASS files shouldn't be parsed by Acorn
  } else {
    ast = content;

    if (typeof content === 'object') {
      precinct.ast = content;
    }
  }

  type = type || getModuleType.fromSource(ast);

  var theDetective;

  switch (type) {
    case 'commonjs':
      theDetective = detectiveCjs;
      break;
    case 'amd':
      theDetective = detectiveAmd;
      break;
    case 'es6':
      theDetective = detectiveEs6;
      break;
    case 'sass':
      theDetective = detectiveSass;
      break;
    case 'stylus':
      theDetective = detectiveStylus;
      break;
  }

  if (theDetective) {
    dependencies = theDetective(ast, options[type]);
  }

  // For non-JS files that we don't parse
  if (theDetective && theDetective.ast) {
    precinct.ast = theDetective.ast;
  }

  return dependencies;
};

function assign(o1, o2) {
  for (var key in o2) {
    if (o2.hasOwnProperty(key)) {
      o1[key] = o2[key];
    }
  }

  return o1;
}

/**
 * Returns the dependencies for the given file path
 *
 * @param {String} filename
 * @param {Object} [options]
 * @param {Boolean} [options.includeCore=true] - Whether or not to include core modules in the dependency list
 * @return {String[]}
 */
precinct.paperwork = function(filename, options) {
  options = assign({
    includeCore: true
  }, options || {});

  var content = fs.readFileSync(filename, 'utf8');
  var ext = path.extname(filename);
  var type;

  if (ext === '.scss' || ext === '.sass') {
    type = 'sass';

  } else if (ext === '.styl') {
    type = 'stylus';

  } else if (ext === '.less') {
    type = 'less';
  }

  options.type = type;

  var deps = precinct(content, options);

  if (!options.includeCore) {
    return deps.filter(function(d) {
      return !natives[d];
    });
  }

  return deps;
};

module.exports = precinct;
