import * as path from 'path';
import * as childProcess from 'child_process';
import * as events from 'events';
import { onEvent } from '../ssm';
import { TextEncoder } from 'util';
import { Writable } from 'stream';

const mockS3GetObject = jest.fn();
const mockSSMPutParameter = jest.fn();
const mockSSMRemoveParameter = jest.fn();

jest.mock('aws-sdk', () => ({
    S3: jest.fn(() => ({
        getObject: mockS3GetObject,
    })),
    SSM: jest.fn(() => ({
        putParameter: mockSSMPutParameter,
        deleteParameter: mockSSMRemoveParameter,
    })),
}));
jest.mock('child_process');

interface MockS3GetObjectResponse {
    Body: Buffer;
}

beforeEach(() => {
    mockS3GetObject.mockReset();
    mockSSMPutParameter.mockReset();
    mockSSMRemoveParameter.mockReset();
    mockS3GetObject.mockImplementation(() => ({
        promise: (): Promise<MockS3GetObjectResponse> =>
            Promise.resolve({
                Body: Buffer.from(''),
            }),
    }));
    mockSSMPutParameter.mockImplementation(() => ({
        promise: (): Promise<Record<string, unknown>> => Promise.resolve({}),
    }));
    mockSSMRemoveParameter.mockImplementation(() => ({
        promise: (): Promise<Record<string, unknown>> => Promise.resolve({}),
    }));
});

class MockChildProcess extends events.EventEmitter {
    readonly stdout: events.EventEmitter;
    readonly stderr: events.EventEmitter;
    readonly stdin: Writable;

    constructor() {
        super();

        this.stdout = new events.EventEmitter();
        this.stderr = new events.EventEmitter();

        this.stdin = ({
            end: jest.fn(),
        } as unknown) as Writable;
    }
}

interface SetMockSpawnProps {
    stdoutData: string;
    stderrData?: string;
    code?: number;
}

const setMockSpawn = (props: SetMockSpawnProps): MockChildProcess => {
    const { stdoutData = null, stderrData = null, code = 0 } = props;
    const emitter = new MockChildProcess();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (childProcess.spawn as jest.Mock).mockImplementationOnce((file: string, args: Array<string>, options: Record<string, unknown>) => {
        if (stdoutData) {
            setTimeout(() => {
                emitter.stdout.emit('data', new TextEncoder().encode(stdoutData));
            }, 10);
        }
        if (stderrData) {
            setTimeout(() => {
                emitter.stderr.emit('data', new TextEncoder().encode(stderrData));
            }, 10);
        }
        setTimeout(() => {
            emitter.emit('close', code);
        }, 20);

        return emitter as childProcess.ChildProcess;
    });
    return emitter;
};

describe.only('OnCreate', () => {
    test('simpleCreate', async () => {
        const mockProc = setMockSpawn({ stdoutData: JSON.stringify({ a: 'abc', b: 'def' }) });
        mockS3GetObject.mockImplementation(() => ({
            promise: (): Promise<MockS3GetObjectResponse> =>
                Promise.resolve({
                    Body: Buffer.from('a: 1234, b: 4321'),
                }),
        }));
        mockSSMPutParameter.mockImplementation(() => ({
            promise: (): Promise<Record<string, unknown>> => Promise.resolve({}),
        }));

        const res = await onEvent({
            RequestType: 'Create',
            ResourceProperties: {
                KMSKeyArn: 'key/123',
                S3Bucket: 'bucket',
                S3Path: 'test.yaml',
                Mappings: JSON.stringify({
                    '/kanbber/temp/test1': {
                        path: ['a'],
                    },
                    '/kanbber/temp/test2': {
                        path: ['b'],
                    },
                }),
                FileType: 'yaml',
            },
        });
        expect(res.Data).toStrictEqual({});
        expect(res.PhysicalResourceId).toContain('ssm_secretdata_');
        expect(mockProc.stdin.end).toBeCalledWith('a: 1234, b: 4321');
        expect(mockS3GetObject).toBeCalledWith({
            Bucket: 'bucket',
            Key: 'test.yaml',
        });

        expect(childProcess.spawn as jest.Mock).toBeCalledWith(
            'sh',
            ['-c', 'cat', '-', '|', path.normalize(path.join(__dirname, '../sops')), '-d', '--input-type', 'yaml', '--output-type', 'json', '--kms', 'key/123', '/dev/stdin'],
            {
                shell: true,
                stdio: 'pipe',
            },
        );
    });
});

describe('onDelete', () => {
    test('simpleDelete', async () => {
        mockSSMRemoveParameter.mockImplementation(() => ({
            promise: (): Promise<Record<string, unknown>> => Promise.resolve({}),
        }));

        expect(
            await onEvent({
                RequestType: 'Delete',
                PhysicalResourceId: 'ssm_secretdata_123',
                ResourceProperties: {
                    KMSKeyArn: 'key/123',
                    S3Bucket: 'bucket',
                    S3Path: 'test.yaml',
                    Mappings: JSON.stringify({
                        '/kanbber/temp/test1': {
                            path: ['a'],
                        },
                        '/kanbber/temp/test2': {
                            path: ['b'],
                        },
                    }),
                    FileType: 'yaml',
                },
            }),
        ).toEqual({
            Data: {},
            PhysicalResourceId: 'ssm_secretdata_123',
        });
    });
});

describe('unknown event type', () => {
    test('simple', async () => {
        await expect(
            onEvent({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                RequestType: 'BadEventType' as any,
                ResourceProperties: {
                    KMSKeyArn: 'key/123',
                    S3Bucket: 'bucket',
                    S3Path: 'test.yaml',
                    Mappings: JSON.stringify({
                        '/fgr/temp/test1': {
                            path: ['a'],
                        },
                        '/fgr/temp/test2': {
                            path: ['b'],
                        },
                    }),
                    FileType: 'yaml',
                },
                PhysicalResourceId: 'ssm_secretdata_123',
            }),
        ).rejects.toThrow('Failed');

        expect(mockS3GetObject).not.toHaveBeenCalled();
        expect(mockSSMPutParameter).not.toHaveBeenCalled();
    });
});
