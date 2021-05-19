import { expect as cdkExpect, haveResource } from '@aws-cdk/assert';
import { Stack } from '@aws-cdk/core';
import '@aws-cdk/assert/jest';
import { SopsSSMParameter } from '..';
import * as kms from '@aws-cdk/aws-kms';
import * as ssm from '@aws-cdk/aws-ssm';
import * as s3Assets from '@aws-cdk/aws-s3-assets';

test('creates a secret, and a custom resource', () => {
    const stack = new Stack();
    const key = new kms.Key(stack, 'testKey');

    new SopsSSMParameter(stack, 'SecretValues', {
        kmsKey: key,
        ssmParameterName: 'test',
        secretsPath: ['a', 'b'],
        filePath: './test/test.yaml',
        fileType: 'yaml',
    });

    cdkExpect(stack).to(
        haveResource('Custom::SopsSSMParameter', {
            KMSKeyArn: stack.resolve(key.keyArn),
            SopsPath: ['a', 'b'],
        }),
    );
});

test('can pass an asset rather than a path', () => {
    const stack = new Stack();
    const key = new kms.Key(stack, 'testKey');

    const secretAsset = new s3Assets.Asset(stack, 'SecretAsset', {
        path: './test/test.yaml',
    });

    const parameter = new ssm.StringParameter(stack, 'parameter', {
        stringValue: 'temp',
    });

    new SopsSSMParameter(stack, 'SecretValues', {
        kmsKey: key,
        ssmParameter: parameter,
        asset: secretAsset,
        secretsPath: ['a', 'b'],
        fileType: 'yaml',
    });

    cdkExpect(stack).to(
        haveResource('Custom::SopsSSMParameter', {
            S3Bucket: stack.resolve(secretAsset.s3BucketName),
            S3Path: stack.resolve(secretAsset.s3ObjectKey),
        }),
    );
});

test('errors if passed both a path and an asset', () => {
    const stack = new Stack();
    const key = new kms.Key(stack, 'testKey');
    const secretAsset = new s3Assets.Asset(stack, 'SecretAsset', {
        path: './test/test.yaml',
    });

    expect(() => {
        new SopsSSMParameter(stack, 'SecretValues', {
            kmsKey: key,
            asset: secretAsset,
            secretsPath: ['a', 'b'],
            fileType: 'yaml',
        });
    }).toThrowError();
});

test('errors if passed neither a path nor an asset', () => {
    const stack = new Stack();
    const key = new kms.Key(stack, 'testKey');

    expect(() => {
        new SopsSSMParameter(stack, 'SecretValues', {
            secretsPath: ['a', 'b'],
            kmsKey: key,
            fileType: 'yaml',
        });
    }).toThrowError();
});
