// Utilidad para transformar keys de objetos de camelCase a snake_case y viceversa sin usar librerías ESM

const toSnakeCase = (str) =>
  str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

const toCamelCase = (str) =>
  str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

const transformKeys = (obj, transformer) => {
  if (Array.isArray(obj)) {
    return obj.map(v => transformKeys(v, transformer));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      result[transformer(key)] = transformKeys(obj[key], transformer);
      return result;
    }, {});
  }
  return obj;
};

const toSnakeCaseObj = (obj) => transformKeys(obj, toSnakeCase);
const toCamelCaseObj = (obj) => transformKeys(obj, toCamelCase);

module.exports = {
  toSnakeCase,
  toCamelCase,
  toSnakeCaseObj,
  toCamelCaseObj
};
