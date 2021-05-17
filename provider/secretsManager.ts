import * as aws from 'aws-sdk';
import { log, logError, normaliseBoolean } from './assets/helper';
import { Mappings, resolveMappings } from './assets/mapper';
import { Sops, SopsWholeFileData } from './assets/useSops';

interface SecretsManagerResourceProperties {
    KMSKeyArn: string;
    S3Bucket: string;
    S3Path: string;
    Mappings: string; // json encoded Mappings;
    WholeFile: boolean | string;
    SecretArn: string;
    SourceHash: string;
    FileType: string;
}

type RequestType = 'Create' | 'Update' | 'Delete';

interface BaseEvent {
    RequestType: RequestType;
}

interface CreateEvent extends BaseEvent {
    ResourceProperties: SecretsManagerResourceProperties;
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

const setSecretString = async (secretString: string, secretArn: string): Promise<void> => {
    const secretsManager = new aws.SecretsManager();
    return secretsManager
        .putSecretValue({
            SecretId: secretArn,
            SecretString: secretString,
        })
        .promise()
        .then(() => {
            // do nothing
        });
};

const handleCreate = async (event: CreateEvent): Promise<Response> => {
    const mappings = JSON.parse(event.ResourceProperties.Mappings) as Mappings;
    const wholeFile = normaliseBoolean(event.ResourceProperties.WholeFile);
    const secretArn = event.ResourceProperties.SecretArn;

    const sops = new Sops({
        wholeFile: wholeFile,
        fileType: event.ResourceProperties.FileType,
        s3BucketName: event.ResourceProperties.S3Bucket,
        s3Path: event.ResourceProperties.S3Path,
        kmsKeyArn: event.ResourceProperties.KMSKeyArn,
    });
    await sops.getFromS3();
    const data = await sops.decode();

    if (wholeFile) {
        log('Writing decoded data to secretsmanager as whole file', { secretArn });
        const wholeFileData = (data as SopsWholeFileData).data || '';
        await setSecretString(wholeFileData, secretArn);
    } else {
        log('Mapping values from decoded data', { mappings });
        const mappedValues = resolveMappings(data, mappings);
        log('Writing decoded data to secretsmanager as JSON file', { secretArn });
        await setSecretString(JSON.stringify(mappedValues), secretArn);
    }
    log('Wrote data to secretsmanager');

    return Promise.resolve({
        PhysicalResourceId: `secretdata_${secretArn}`,
        Data: {},
    });
};

const handleUpdate = async (event: UpdateEvent): Promise<Response> => {
    const physicalResourceId = event.PhysicalResourceId;
    const response = await handleCreate(event as CreateEvent);
    return Promise.resolve({
        ...response,
        PhysicalResourceId: physicalResourceId,
    });
};

const handleDelete = async (event: DeleteEvent): Promise<Response> => {
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
