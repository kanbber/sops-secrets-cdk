#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
// import { SopsExampleStack } from '../lib/sops-example-stack';
import { SopsExampleStackNew } from '../lib/sops-ssm-example-stack';

const app = new cdk.App();
// new SopsExampleStack(app, 'SopsExampleStack');
new SopsExampleStackNew(app, 'SopsExampleStackNew');
