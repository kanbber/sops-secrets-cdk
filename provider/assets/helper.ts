export const log = (message: string, extra: Record<string, unknown> = {}): void => {
    console.log(
        JSON.stringify({
            message,
            ...extra,
        }),
    );
};

export const logError = (error: Error, message: string, extra: Record<string, unknown> = {}): void => {
    const stack = error.stack;
    const stackLines = stack ? stack.split(/\n/) : [];
    console.error(
        JSON.stringify({
            error: {
                name: error.name,
                message: error.message,
                stack: stackLines,
            },
            message,
            ...extra,
        }),
    );
};

export const normaliseBoolean = (value: boolean | string): boolean => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        if (value === 'true') {
            return true;
        }
        if (value === 'false') {
            return false;
        }
        throw new Error(`Unexpected string value when normalising boolean: ${value}`);
    }
    throw new Error(`Unexpected type ${typeof value}, ${value} when normalising boolean`);
};
