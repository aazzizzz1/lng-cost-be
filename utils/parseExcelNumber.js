// utils/parseExcelNumber.js

const parseExcelNumber = (value) => {
  let num = 0;
  if (typeof value === 'string') {
    num = parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
  } else if (typeof value === 'number') {
    num = value;
  }
  // Return the number as-is, preserving all decimals
  return num;
};

module.exports = parseExcelNumber;
