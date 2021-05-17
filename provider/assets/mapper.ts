export type MappingEncoding = 'string' | 'json';

interface Mapping {
    path: Array<string>;
    encoding?: MappingEncoding;
}

export interface Mappings {
    [name: string]: Mapping;
}

export type MappedValues = {
    [name: string]: string;
};

export interface JsonData {
    [key: string]: unknown;
}

export const resolveMappingPath = (data: JsonData, path: Array<string>, encoding: MappingEncoding): string | undefined => {
    if (typeof data !== 'object') {
        return undefined;
    }

    if (path.length > 1) {
        const [head, ...rest] = path;
        return resolveMappingPath(data[head] as JsonData, rest, encoding);
    }

    const value = data[path[0]];

    if (typeof value === 'undefined') {
        return undefined;
    }

    switch (encoding) {
        case 'string' as MappingEncoding:
            if (typeof value === 'object') {
                return undefined;
            }
            return String(value);
        case 'json' as MappingEncoding:
            return JSON.stringify(value);
    }

    throw new Error(`Unknown encoding ${encoding}`);
};

export const resolveMappings = (data: unknown, mappings: Mappings): MappedValues => {
    const mapped = {} as MappedValues;
    Object.entries(mappings).forEach((keyAndMapping: [string, Mapping]) => {
        const [key, mapping] = keyAndMapping;
        const value = resolveMappingPath(data as JsonData, mapping.path, mapping.encoding || ('string' as MappingEncoding));
        if (typeof value !== 'undefined') {
            mapped[key] = value;
        }
    });
    return mapped;
};
