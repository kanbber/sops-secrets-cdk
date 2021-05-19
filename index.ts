import * as kms from '@aws-cdk/aws-kms';
import * as ssm from '@aws-cdk/aws-ssm';
import * as s3 from '@aws-cdk/aws-s3';
import * as logs from '@aws-cdk/aws-logs';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3Assets from '@aws-cdk/aws-s3-assets';
import * as secretsManager from '@aws-cdk/aws-secretsmanager';
import * as cdk from '@aws-cdk/core';
import * as customResource from '@aws-cdk/custom-resources';
import * as path from 'path';

type SopsSecretsManagerEncoding = 'string' | 'json';

type SopsSecretsManagerFileType = 'yaml' | 'json';

interface SopsSecretsManagerMapping {
    path: Array<string>;
    encoding?: SopsSecretsManagerEncoding;
}

interface SopsSecretsManagerMappings {
    [key: string]: SopsSecretsManagerMapping;
}

interface SopsProviderProps {
    readonly kmsKey: kms.IKey;
    readonly bucket: s3.IBucket;
}

interface SSMParameterProviderProps extends SopsProviderProps {
    readonly parameter: ssm.IParameter;
}

interface SopsSecretsMangerProviderProps extends SopsProviderProps {
    readonly secretsManager: secretsManager.ISecret;
}

export interface SopsSSMParameterProps {
    /**
     * SSM Parameter to add a scret to. Either this xor ssmParameterName has to exists.
     */
    readonly ssmParameter?: ssm.IParameter;

    /**
     * SSM Parameter name for the new parameter. Either this xor ssmParamete has to exists.
     */
    readonly ssmParameterName?: string;

    /**
     * The S3 asset the sops file is in. Either this asset xor filePath have to be present.
     */
    readonly asset?: s3Assets.Asset;

    /**
     * path to the sops file. Either this filePath xor asset have to be present.
     */
    readonly filePath?: string;

    /**
     * KMS key to use.
     */
    readonly kmsKey: kms.IKey;

    /**
     * Array with the path to the secret in the json or yaml sopy file
     */
    readonly secretsPath: Array<string>;

    /**
     * Are we using yaml or json.
     *
     * @default json
     */
    readonly fileType: SopsSecretsManagerFileType;
}

export interface SopsSecretsManagerProps {
    /**
     * aws secret to tadd the data from the sops file to.
     */
    readonly secret?: secretsManager.Secret | secretsManager.ISecret;

    /**
     * Name of the secret. Is only needed when no secret is given.
     */
    readonly secretName?: string;

    /**
     * The S3 asset the sops file is in. Either this asset xor filePath have to be present.
     */
    readonly asset?: s3Assets.Asset;

    /**
     * If no asset was given. A path to the sops file has to exist.
     */
    readonly path?: string;

    /**
     * KMSKey to use for decryption
     */
    readonly kmsKey: kms.IKey;

    /**
     * Mapping of the Secrets to add and the path where it is stored in the sops file.
     */
    readonly mappings?: SopsSecretsManagerMappings;

    /**
     * Take the whole file insted of a mapping.
     */
    readonly wholeFile?: boolean;

    /**
     * Are we using yaml or json.
     *
     * @default json
     */
    readonly fileType?: SopsSecretsManagerFileType;
}

const getAsset = (construct: cdk.Construct, asset?: s3Assets.Asset, secretFilePath?: string): s3Assets.Asset => {
    if (asset && secretFilePath) {
        throw new Error('Cannot set both asset and path');
    }
    if (asset) {
        return asset;
    }
    if (secretFilePath) {
        return new s3Assets.Asset(construct, 'SopsAsset', {
            path: secretFilePath,
        });
    }
    throw new Error('Must set one of asset or path');
};

class SopsSSMParameterProvider extends cdk.Construct {
    public readonly provider: customResource.Provider;

    public static getOrCreate(scope: cdk.Construct, props: SSMParameterProviderProps): string {
        const stack = cdk.Stack.of(scope);
        const id = 'kanbber-sops-ssmparameter';
        const x = (stack.node.tryFindChild(id) as SopsSSMParameterProvider) || new SopsSSMParameterProvider(stack, id, props);
        return x.provider.serviceToken;
    }

    constructor(scope: cdk.Construct, id: string, props: SSMParameterProviderProps) {
        super(scope, id);

        const customLambda = new lambda.Function(this, 'sops-ssmparameter-event', {
            code: lambda.Code.fromAsset(path.join(__dirname, 'provider')),
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: 'ssm.onEvent',
            timeout: cdk.Duration.minutes(5),
            logRetention: logs.RetentionDays.ONE_DAY,
        });

        props.kmsKey.grantEncryptDecrypt(customLambda);
        props.bucket.grantReadWrite(customLambda);
        props.parameter.grantWrite(customLambda);

        this.provider = new customResource.Provider(this, 'sops-ssmparameter-provider', {
            onEventHandler: customLambda,
            logRetention: logs.RetentionDays.ONE_DAY,
        });
    }
}

class SopsSecretsManagerProvider extends cdk.Construct {
    public readonly provider: customResource.Provider;

    public static getOrCreate(scope: cdk.Construct, props: SopsSecretsMangerProviderProps): string {
        const stack = cdk.Stack.of(scope);
        const id = 'kanbber-sops-secrets-manager';
        const x = (stack.node.tryFindChild(id) as SopsSecretsManagerProvider) || new SopsSecretsManagerProvider(stack, id, props);
        return x.provider.serviceToken;
    }

    constructor(scope: cdk.Construct, id: string, props: SopsSecretsMangerProviderProps) {
        super(scope, id);

        const customLambda = new lambda.Function(this, 'sops-secrets-manager-event', {
            code: lambda.Code.fromAsset(path.join(__dirname, 'provider')),
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: 'secretsManager.onEvent',
            timeout: cdk.Duration.minutes(5),
            logRetention: logs.RetentionDays.ONE_DAY,
        });

        props.kmsKey.grantEncryptDecrypt(customLambda);
        props.secretsManager.grantWrite(customLambda);
        props.secretsManager.grantRead(customLambda);
        props.bucket.grantReadWrite(customLambda);

        this.provider = new customResource.Provider(this, 'sops-secrets-manager-provider', {
            onEventHandler: customLambda,
            logRetention: logs.RetentionDays.ONE_DAY,
        });
    }
}

export class SopsSSMParameter extends cdk.Construct {
    public readonly asset: s3Assets.Asset;
    public readonly ssmParameter: ssm.IParameter;

    constructor(scope: cdk.Construct, id: string, props: SopsSSMParameterProps) {
        super(scope, id);
        this.asset = getAsset(this, props.asset, props.filePath);

        if (props.ssmParameter && props.ssmParameterName) {
            throw new Error('Cannot set both ssmParameter and ssmParameterName');
        } else if (props.ssmParameterName) {
            this.ssmParameter = new ssm.StringParameter(this, 'ssmParameter', {
                parameterName: props.ssmParameterName,
                stringValue: 'temp',
            });
        } else if (props.ssmParameter) {
            this.ssmParameter = props.ssmParameter;
        } else {
            throw new Error('Must set one of secret or secretName');
        }

        new cdk.CustomResource(this, 'SSMResource', {
            serviceToken: SopsSSMParameterProvider.getOrCreate(this, {
                kmsKey: props.kmsKey,
                bucket: this.asset.bucket,
                parameter: this.ssmParameter,
            }),
            resourceType: 'Custom::SopsSSMParameter',
            properties: {
                SopsPath: props.secretsPath,
                SopsSSMParameter: this.ssmParameter.parameterName,
                S3Bucket: this.asset.s3BucketName,
                S3Path: this.asset.s3ObjectKey,
                KMSKeyArn: props.kmsKey?.keyArn,
                FileType: props.fileType,
            },
        });
    }
}

export class SopsSecretsManager extends cdk.Construct {
    public readonly secret: secretsManager.ISecret;
    public readonly secretArn: string;
    public readonly asset: s3Assets.Asset;

    constructor(scope: cdk.Construct, id: string, props: SopsSecretsManagerProps) {
        super(scope, id);

        if (props.secret && props.secretName) {
            throw new Error('Cannot set both secret and secretName');
        } else if (props.secret) {
            this.secretArn = props.secret.secretArn;
            this.secret = props.secret;
        } else if (props.secretName) {
            this.secret = new secretsManager.Secret(this, 'Secret', {
                secretName: props.secretName,
            });
            this.secretArn = this.secret.secretArn;
        } else {
            throw new Error('Must set one of secret or secretName');
        }
        this.asset = getAsset(this, props.asset, props.path);

        if (props.wholeFile && props.mappings) {
            throw new Error('Cannot set mappings and set wholeFile to true');
        } else if (!props.wholeFile && !props.mappings) {
            throw new Error('Must set mappings or set wholeFile to true');
        }

        new cdk.CustomResource(this, 'SecretsResource', {
            serviceToken: SopsSecretsManagerProvider.getOrCreate(this, {
                kmsKey: props.kmsKey,
                bucket: this.asset.bucket,
                secretsManager: this.secret,
            }),
            resourceType: 'Custom::SopsSecretsManager',
            properties: {
                SecretArn: this.secretArn,
                S3Bucket: this.asset.s3BucketName,
                S3Path: this.asset.s3ObjectKey,
                SourceHash: this.asset.assetHash,
                KMSKeyArn: props.kmsKey.keyArn,
                Mappings: JSON.stringify(props.mappings || {}),
                WholeFile: props.wholeFile || false,
                FileType: props.fileType,
            },
        });
    }
}
