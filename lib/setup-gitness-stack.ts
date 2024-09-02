import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as ecspatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';

export class SetupGitnessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a VPC with 9x subnets divided over 3 AZ's
    const vpc = new ec2.Vpc(this, 'GitnessVPC', {
      cidr: '172.32.0.0/16',
      natGateways: 1,
      maxAzs: 3,
      subnetConfiguration: [
        {
          cidrMask: 20,
          name: 'gitness-public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 20,
          name: 'gitness-application',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 20,
          name: 'gitness-data',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, 'gitness-service-cluster', {
      clusterName: 'gitness-service-cluster',
      containerInsights: true,
      vpc: vpc,
    });


    const webSecurityGroup = new ec2.SecurityGroup(this, "gitness-web-sg", {
      securityGroupName: `Gitness-Web-app`,
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
        ownerGid: "1000",
        ownerUid: "1000",
        permissions: "755"
      },
      posixUser: {
        uid: "1000",
        gid: "1000"
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


    //https://hub.docker.com/r/harness/gitness
    const image = ecs.ContainerImage.fromRegistry('harness/gitness');


    const taskDefinition = new ecs.TaskDefinition(this, 'gitness-web-task', {
      compatibility: ecs.Compatibility.FARGATE,
      memoryMiB: '512',
      cpu: '256',
      
    });
    fileSystem.grantRootAccess(taskDefinition.taskRole);

    taskDefinition.addContainer('defaultContainer', {
      image: ecs.ContainerImage.fromRegistry('harness/gitness'),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'gitness',
      }),
      workingDirectory: '/data',
      environment: {
        'GITNESS_URL_BASE': 'http://setupg-gitne-ogolf6qwikx9-33268151.eu-central-1.elb.amazonaws.com/'
      }
    }).addPortMappings({
      containerPort: 3000,
    });

    const volume = {
      // Use an Elastic FileSystem
      name: "data",
      efsVolumeConfiguration
    };
    taskDefinition.addVolume(volume);


    // Create higher level construct containing the Fargate service with a load balancer
    const service = new ecspatterns.ApplicationLoadBalancedFargateService(this, 'gitness-service', {
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
  }

}
