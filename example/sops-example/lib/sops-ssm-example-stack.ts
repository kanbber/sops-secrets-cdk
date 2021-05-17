import * as cdk from '@aws-cdk/core';
import * as kms from '@aws-cdk/aws-kms';
// import * as ssm from '@aws-cdk/aws-ssm';
import { SopsSSMParameter } from './sops-secrets-cdk-dev';

export class SopsExampleStackNew extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // const parameter = new ssm.StringParameter(this, 'parameter', { parameterName: 'fgr-kanbberr-key', stringValue: 'temp' });

        const key = new kms.Key(this, 'key');

        new SopsSSMParameter(this, 'TestSops', {
            ssmParameterName: 'fgr-kanbbbber',
            filePath: '../sample_secret.yaml',
            kmsKey: key,
            secretsPath: ['key1'],
            fileType: 'yaml',
        });

        // new cdk.CfnOutput(this, 'secret', {
        //     value: parameter.stringValue,
        // });
    }
}
