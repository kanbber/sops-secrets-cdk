import * as aws from 'aws-sdk';
import { log, logError } from './assets/helper';
import * as map from './assets/mapper';
import { Sops } from './assets/useSops';

interface ResourceProperties {
    SopsPath: Array<string>;
    SopsSSMParameter: string;
    KMSKeyArn: string;
    S3Bucket: string;
    S3Path: string;
    FileType: string;
}

type RequestType = 'Create' | 'Update' | 'Delete';

interface BaseEvent {
    RequestType: RequestType;
}

interface CreateEvent extends BaseEvent {
    ResourceProperties: ResourceProperties;
}

interface UpdateEvent extends CreateEvent {
    PhysicalResourceId: string;
}

interface DeleteEvent extends BaseEvent {
    PhysicalResourceId: string;
}

interface Response {
    PhysicalResourceId: string;
    Data: Record<string, unknown>;
}

type Event = CreateEvent | UpdateEvent | DeleteEvent;

const handleCreate = async (event: CreateEvent): Promise<Response> => {
    const sops = new Sops({
        wholeFile: false,
        fileType: event.ResourceProperties.FileType,
        s3BucketName: event.ResourceProperties.S3Bucket,
        s3Path: event.ResourceProperties.S3Path,
        kmsKeyArn: event.ResourceProperties.KMSKeyArn,
    });
    await sops.getFromS3();
    const data = await sops.decode();

    const value = map.resolveMappingPath(data as map.JsonData, event.ResourceProperties.SopsPath, 'string');
    if (value) {
        log(`Write SSM Parameter with key: ${event.ResourceProperties.SopsSSMParameter}:${value}`);
        const ssm = new aws.SSM({ region: 'eu-central-1' });
        await ssm
            .putParameter({
                Name: event.ResourceProperties.SopsSSMParameter,
                Value: value,
                Type: 'SecureString',
                Overwrite: true,
                KeyId: event.ResourceProperties.KMSKeyArn.split('/')[1],
            })
            .promise()
            .then(() => {
                log('goood');
                // do nothing
            })
            .catch(() => {
                log('error');
            });

        log('Wrote data to ssm parameter');
    } else {
        throw new Error('secret could not be found');
    }
    const ssm_uuid = uuid();
    log('SSM UUID is: ' + ssm_uuid);

    return Promise.resolve({
        PhysicalResourceId: `ssm_secretdata_${ssm_uuid}`,
        Data: {},
    });
};

function uuid() {
    let uuidValue = '',
        k: number,
        randomValue: number;
    for (k = 0; k < 32; k++) {
        randomValue = (Math.random() * 16) | 0;

        if (k == 8 || k == 12 || k == 16 || k == 20) {
            uuidValue += '-';
        }
        uuidValue += (k == 12 ? 4 : k == 16 ? (randomValue & 3) | 8 : randomValue).toString(16);
    }
    return uuidValue;
}

const handleUpdate = async (event: UpdateEvent): Promise<Response> => {
    const physicalResourceId = event.PhysicalResourceId;
    const response = await handleCreate(event as CreateEvent);
    return Promise.resolve({
        ...response,
        PhysicalResourceId: physicalResourceId,
    });
};

const handleDelete = async (event: DeleteEvent): Promise<Response> => {
    log('Deleting the ssm parameters again');
    return Promise.resolve({
        PhysicalResourceId: event.PhysicalResourceId,
        Data: {},
    });
};

export const onEvent = (event: Event): Promise<Response> => {
    log('Handling event', { event });
    try {
        const eventType = event.RequestType as string;
        switch (eventType) {
            case 'Create':
                return handleCreate(event as CreateEvent);
            case 'Update':
                return handleUpdate(event as UpdateEvent);
            case 'Delete':
                return handleDelete(event as DeleteEvent);
        }
        throw new Error(`Unknown event type ${eventType}`);
    } catch (err) {
        logError(err, 'Unhandled error, failing');
        return Promise.reject(new Error('Failed'));
    }
};
