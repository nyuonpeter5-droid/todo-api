const { isValidState } = require('../app');

describe('Unit Tests: State Validation Helper', () => {
  test('should return true for valid states', () => {
    expect(isValidState('todo')).toBe(true);
    expect(isValidState('doing')).toBe(true);
    expect(isValidState('done')).toBe(true);
  });

  test('should return false for invalid states', () => {
    expect(isValidState('completed')).toBe(false);
    expect(isValidState('')).toBe(false);
    expect(isValidState(null)).toBe(false);
    expect(isValidState(undefined)).toBe(false);
  });
});