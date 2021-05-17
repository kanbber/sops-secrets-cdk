import { TextDecoder } from 'util';
import * as childProcess from 'child_process';
import * as path from 'path';
import { Writable } from 'stream';
import * as aws from 'aws-sdk';
import { log } from './helper';

export interface SopsProps {
    wholeFile: boolean;
    fileType: string;
    s3BucketName: string;
    s3Path: string;
    kmsKeyArn: string | undefined;
}

export interface SopsWholeFileData {
    data: string;
}

export class Sops {
    readonly wholeFile: boolean;
    fileType: string;
    readonly s3BucketName: string;
    readonly s3Path: string;
    readonly kmsKeyArn: string | undefined;
    fileBody: string;

    constructor(props: SopsProps) {
        this.wholeFile = props.wholeFile;
        if (props.fileType) {
            this.fileType = props.fileType;
        }
        this.s3BucketName = props.s3BucketName;
        this.s3Path = props.s3Path;
        if (props.kmsKeyArn) {
            this.kmsKeyArn = props.kmsKeyArn;
        }

        // await this.getFromS3();
    }

    public decode = async (): Promise<unknown> => {
        log('Running sops command');
        const sopsArgs = ['-d', '--input-type', this.fileType, '--output-type', 'json', ...(this.kmsKeyArn ? ['--kms', this.kmsKeyArn] : []), '/dev/stdin'];
        log('Sops command args', { sopsArgs });
        const result = await this.execPromise([path.join(__dirname, 'sops'), ...sopsArgs], this.fileBody);
        const parsed = JSON.parse(result);
        return Promise.resolve(parsed);
    };

    public getFromS3 = async (): Promise<void> => {
        const s3 = new aws.S3({ region: 'eu-central-1' });

        const getObjectParams = {
            Bucket: this.s3BucketName,
            Key: this.s3Path,
        };
        log('Getting object from S3', { params: getObjectParams });
        const obj = await s3.getObject(getObjectParams).promise();
        log('Reading file');
        this.fileBody = (obj.Body as Buffer).toString('utf-8');
        log(this.fileType);
        this.fileType = this.determineFileType(this.s3Path, this.fileType, this.wholeFile);
        log(`Decoding with sops ${this.fileBody} ${this.fileType} ${this.kmsKeyArn}`);
    };

    private determineFileType = (s3Path: string, fileType: string | undefined, wholeFile: boolean): string => {
        if (fileType) {
            return fileType;
        }
        if (wholeFile) {
            return 'json';
        }
        const parts = s3Path.split('.') as Array<string>;
        return parts.pop() as string;
    };

    private bytesToString = (byteArray: Uint8Array): string => {
        return new TextDecoder().decode(byteArray);
    };

    private execPromise = async (args: Array<string>, input: string): Promise<string> => {
        return new Promise((res: (result: string) => void, rej: (error: Error) => void): void => {
            const proc = childProcess.spawn('sh', ['-c', 'cat', '-', '|', ...args], { stdio: 'pipe', shell: true });
            (proc.stdin as Writable).end(input);

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data: Uint8Array) => {
                stdout += this.bytesToString(data);
            });

            proc.stderr.on('data', (data: Uint8Array) => {
                stderr += this.bytesToString(data);
            });

            proc.on('close', (code: number) => {
                if (code > 0) {
                    log(`Exec exited with code ${code}`, {
                        stdout,
                        stderr,
                    });
                    rej(new Error(`Exec exited with code ${code}`));
                } else {
                    if (stderr) {
                        log(`Exec exited cleanly, but stderr was not empty`, {
                            stderr,
                        });
                    } else {
                        log('Exec exited cleanly');
                    }
                    res(stdout);
                }
            });
        });
    };
}
