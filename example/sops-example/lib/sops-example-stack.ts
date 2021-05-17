import * as cdk from '@aws-cdk/core';
import * as kms from '@aws-cdk/aws-kms';
import { SopsSecretsManager } from './sops-secrets-cdk-dev';

export class SopsExampleStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        new SopsSecretsManager(this, 'TestSops', {
            path: '../sample_secret.yaml',
            kmsKey: new kms.Key(this, 'key'),
            mappings: {
                'fgr-kanbber-key1': {
                    path: ['key1'],
                },
                'fgr-kanbber-key2': {
                    path: ['key2'],
                },
            },
            fileType: 'yaml',
        });
    }
}
