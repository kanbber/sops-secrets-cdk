import * as map from '../mapper';

test('empty', () => {
    expect(1).toBe(1);
});

describe('mappings', () => {
    test('simple', () => {
        const easy: map.Mappings = {
            res1: {
                path: ['key1'],
            },
            res2: {
                path: ['key2'],
            },
            res3: {
                path: ['key3', 'key4', 'key5'],
            },
            res4: {
                path: ['Not_there'],
            },
            resNumber: {
                path: ['keyNumber'],
            },
            resEnc1: {
                path: ['key1'],
                encoding: 'string',
            },
        };
        const data = {
            key1: 'value1',
            key2: 'value2',
            key3: { key4: { key5: 'value3' } },
            keyNumber: 1,
        };
        const res = map.resolveMappings(data, easy);

        expect(res.res1).toBe('value1');
        expect(res.res2).toBe('value2');
        expect(res.res3).toBe('value3');
        expect(res.resEnc1).toBe('value1');
        expect(res.resNumber).toBe('1');
        expect('res4' in res).toBeFalsy();
    });

    test('encoding', () => {
        const res = map.resolveMappings(
            { x: {} },
            {
                resError: {
                    path: ['x'],
                    encoding: 'json',
                },
            },
        );
        expect(res.resError).toBe('{}');
    });
});
