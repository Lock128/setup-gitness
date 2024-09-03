# Setting up Gitness on AWS ECS as a service

This project sets up [Gitness](https://github.com/harness/gitness) on Amazon ECS Fargate running as a service using for CDK development with TypeScript.


## What is Gitness?
Gitness is an open source development platform packed with the power of code hosting and automated DevOps pipelines.

You can use it as your self-hosted version of the now deprecated AWS CodeCommit.

The functionalities of "Pipelines" and "Gitspaces" - which are a functionality of Gitness - are currently **NOT** supported when running Gitness on Amazon ECS as they require a Docker daemon and thats not supported by Fargate.

## Pre-Requisites
- Set up an AWS account
- Set up secrets for your repository/fork
```
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## Deployment
Once you push a change to your `main` branch a Github action will automatically deploy the CDK code.

## What will be deployed?
CDK will deploy [lib\setup-gitness-stack.ts](lib\setup-gitness-stack.ts) which includes:
- an Amazon ECS Service that runs the latest official [Gitness container image](https://hub.docker.com/r/harness/gitness)
- an Amazon EFS that is used to store data

Expected costs: [48 USD/month](https://calculator.aws/#/estimate?id=970c8026a305dd39246aa7d2665d5d398ad108d7) (when running in eu-central-1)

## Useful commands

The `cdk.json` file tells the CDK Toolkit how to execute your app.

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
