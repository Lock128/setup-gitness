import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as ecspatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';

export class SetupHarnessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a VPC with 9x subnets divided over 3 AZ's
    const vpc = new ec2.Vpc(this, 'HarnessVPC', {
      cidr: '172.32.0.0/16',
      natGateways: 1,
      maxAzs: 3,
      subnetConfiguration: [
        {
          cidrMask: 20,
          name: 'harness-public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 20,
          name: 'harness-application',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 20,
          name: 'harness-data',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, 'harness-service-cluster', {
      clusterName: 'harness-service-cluster',
      containerInsights: true,
      vpc: vpc,
    });


    const webSecurityGroup = new ec2.SecurityGroup(this, "harness-web-sg", {
      securityGroupName: `Harness-Web-app`,
      vpc,
    });

    webSecurityGroup.addIngressRule(
      webSecurityGroup,
      ec2.Port.tcp(2049) // Enable NFS service within security group
    );


    const fileSystem = new efs.FileSystem(this, "EfsFileSystem", {
      vpc,
      securityGroup: webSecurityGroup
    });

    var accessPoint = new efs.AccessPoint(this, "volumeAccessPoint", {
      fileSystem: fileSystem,
      path: "/data",
      createAcl: {
        ownerGid: "0",
        ownerUid: "0",
        permissions: "755"
      },
      posixUser: {
        uid: "0",
        gid: "0"
      }
    });

    const efsVolumeConfiguration: ecs.EfsVolumeConfiguration = {
      authorizationConfig: {
        accessPointId: accessPoint.accessPointId,
        iam: 'ENABLED',
      },
      fileSystemId: fileSystem.fileSystemId,
      transitEncryption: 'ENABLED',
    };

    //https://hub.docker.com/r/harness/harness

    const taskDefinition = new ecs.TaskDefinition(this, 'harness-web-task', {
      compatibility: ecs.Compatibility.FARGATE,
      memoryMiB: '512',
      cpu: '256',

    });
    fileSystem.grantRootAccess(taskDefinition.taskRole);

    const containerDefinition = {
      image: ecs.ContainerImage.fromRegistry('harness/harness'),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'harness',
      }),
      workingDirectory: '/data',
      environment: {
        'HARNESS_URL_BASE': 'http://setuph-harne-jdifbs5oqfur-1906581189.eu-central-1.elb.amazonaws.com',
        'GITNESS_URL_BASE': 'http://setuph-harne-jdifbs5oqfur-1906581189.eu-central-1.elb.amazonaws.com'
        
      }
    };
/*
    container.addMountPoints({
      sourceVolume: assetVolume.name,
      containerPath: "/mnt/assets",
      readOnly: false,
    });
    */
    
    const volume = {
      // Use an Elastic FileSystem
      name: "data",
      efsVolumeConfiguration
    };
    taskDefinition.addVolume(volume);
    const container = taskDefinition.addContainer('defaultContainer', containerDefinition);
    container.addPortMappings({
      containerPort: 3000,
      hostPort: 3000,
      protocol: ecs.Protocol.TCP,
    });
    container.addMountPoints({
      sourceVolume: volume.name,
      containerPath: "/data",
      readOnly: false,
    });

    // Create higher level construct containing the Fargate service with a load balancer
    const service = new ecspatterns.ApplicationLoadBalancedFargateService(this, 'harness-service', {
      cluster,
      circuitBreaker: {
        rollback: true,
      },
      memoryLimitMiB: 512, // Supported configurations: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationMultipleTargetGroupsFargateService.html#memorylimitmib
      cpu: 256,
      desiredCount: 1,
      taskDefinition: taskDefinition,
      securityGroups: [webSecurityGroup]
    });
    //service.loadBalancer.loadBalancerSecurityGroups.forEach(securityGroup => webSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80)));


    //force redeploy
  }

}
