// utils/parseExcelNumber.js

const parseExcelNumber = (value) => {
  if (typeof value === 'string') {
    return parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
  } else if (typeof value === 'number') {
    return value;
  }
  return 0;
};

module.exports = parseExcelNumber;
