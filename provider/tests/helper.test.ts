import * as help from '../assets/helper';

describe('bool tests', () => {
    test('test', () => {
        expect(help.normaliseBoolean(true)).toBe(true);
        expect(help.normaliseBoolean(false)).toBe(false);
        expect(help.normaliseBoolean('true')).toBe(true);
        expect(help.normaliseBoolean('false')).toBe(false);

        expect(() => {
            help.normaliseBoolean('foo');
        }).toThrowError();
        expect(() => {
            help.normaliseBoolean('1');
        }).toThrow(Error);
    });
});
