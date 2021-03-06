---
layout: post
title:  Creating a Serverless forms service with AWS & Serverless Framework in 2021
date:   2021-01-06 19:00:00 +0000
tags:
    - serverless
    - aws
    - serverless framework
    - nodejs
    - web dev
    - open source
image: /assets/images/blog/serverless-aws-image.png
description: >
    Let's take a look at how to build a serverless web forms service for static websites using AWS & the Serverless Framework
---

This project's repo: 

[![](https://github-readme-stats.vercel.app/api/pin/?username=linaro-marketing&repo=aws_serverless_web_forms)
](https://github.com/linaro-marketing/aws_serverless_web_forms)
## Background

So it's 2021 and static websites are the new norm.

You've got a contact form for collecting leads on your website but no server to handle the form submission. 

As a result there are now many form SaaS products out there that can handle the submission of forms on your static websites for you. If you're deploying with [netlify.com](https://netlify.com), they have their own solution for this.

At Linaro, our main website ([Linaro.org](https://www.linaro.org)) is a static Jekyll website that is being statically served from an S3 bucket with a Cloudfront distribution in front of it enabling global edge requests/caching.

On this site we've got a few forms and over the years we've tried various solutions ranging from CognitoForms to simply `mailto:` links. Recently we've been using an Atlassian Jira Form Plugin, but with recent news regarding Atlassian killing off their server product, we've had to build our own solution as the plugin was either not available in the Cloud version or stupidly expensive.

So we decided to put some time into building a simple serverless forms solution that would:

1. Allow users to submit a form directly on our static website
2. Require users to confirm their form submission via an email verification link (we'll see how this goes!)
3. Have the verified form submission create a new request in Jira

## Let's get started

## Install the Serverless CLI

I'm assuming you're running a unix-based OS for this.

So let's install the [Serverless Framework](https://serverless.com) CLI.

```bash
npm install -g serverless
```
## Setting up our project

You can always clone this project's repo from [https://github.com/linaro-marketing/aws_serverless_web_forms](https://github.com/linaro-marketing/aws_serverless_web_forms). 

Or follow along...

Create a new folder and cd into it:

```bash
mkdir serverless_forms_project && cd serverless_forms_project 
```
Next we'll create a new `serverless.yml` file which will store the details of our infrastructure.

```bash
touch serverless.yml
```

## Breaking down our Serverless Infrastructure 

With the editor of your choice, open `serverless.yml` and add the following:

```yml
service: serverless-web-forms
frameworkVersion: "2"
useDotenv: true
provider:
  name: aws
  stage: ${opt:stage}
  runtime: nodejs12.x
  region: us-east-1
  LambdaHashingVersion: 20201221
  environment:
    ENTRIES_TABLE: ${self:service}-${opt:stage, self:provider.stage}
    SNS_TOPIC_ARN: !Ref FormsSNSTopic
  apiGateway:
    shouldStartNameWithService: true
    apiKeys:
      - name: website
    usagePlan:
      quota:
        limit: 300
        period: MONTH
      throttle:
        burstLimit: 2
        rateLimit: 1
  iamRoleStatements:
    - Effect: Allow
      Action:
        - dynamodb:Query
        - dynamodb:Scan
        - dynamodb:GetItem
        - dynamodb:PutItem
        - ses:SendTemplatedEmail
        - sts:AssumeRole
        - sns:Publish
      Resource: "*"
functions:
  formSubmission:
    handler: index.submit
    memorySize: 128
    environment:
      VERIFICATION_FROM_EMAIL_ADDR: ${env:VERIFICATION_FROM_EMAIL_ADDR}
    description: Save the form entry details to DynamoDB and send the verification email.
    events:
      - http:
          path: formSubmit
          method: post
          private: true
          cors:
            origin: "*"
            headers:
              - Content-Type
              - X-Amz-Date
              - Authorization
              - X-Api-Key
              - X-Amz-Security-Token
              - X-Amz-User-Agent
            allowCredentials: true
  formVerification:
    handler: index.verify
    memorySize: 128
    environment:
      VAULT_DOMAIN: ${env:VAULT_DOMAIN}
      VAULT_PORT: ${env:VAULT_PORT}
      VAULT_IAM_ROLE: ${env:VAULT_IAM_ROLE}
      VAULT_SECRET_PATH: ${env:VAULT_SECRET_PATH}
      SERVICE_DESK_USERNAME: ${env:SERVICE_DESK_USERNAME}
      SERVICE_DESK_DOMAIN: ${env:SERVICE_DESK_DOMAIN}
      VERIFICATION_FROM_EMAIL_ADDR: ${env:VERIFICATION_FROM_EMAIL_ADDR}
    description: Verify the GET token header from the email verification link. Create the new Ticket. Delete the form entry from DynamoDB.
    events:
      - http:
          path: formVerfiy
          method: get
          private: false
resources:
  Resources:
    FormsSNSTopic:
      Type: "AWS::SNS::Topic"
      Properties:
        TopicName: ServerlessFormsTopic
    FormEntriesDynamoDbTable:
      Type: "AWS::DynamoDB::Table"
      DeletionPolicy: Retain
      Properties:
        AttributeDefinitions:
          - AttributeName: "id"
            AttributeType: "S"
        KeySchema:
          - AttributeName: "id"
            KeyType: "HASH"
        ProvisionedThroughput:
          ReadCapacityUnits: 1
          WriteCapacityUnits: 1
        StreamSpecification:
          StreamViewType: "NEW_AND_OLD_IMAGES"
        TableName: ${self:provider.environment.ENTRIES_TABLE}
package:
  exclude:
    - ./form_data.json
    - ./package.json
    - ./setup_form_data.js
    - ./yarn.lock
    - ./config/**
    - ./templates/**
    - ./html_examples/**
  include:
    - ./index.js
    - ./form_data.json
plugins:
  - serverless-offline
  - serverless-plugin-scripts
  - "@haftahave/serverless-ses-template"
custom:
  scripts:
    commands:
      collectFormData: node setup_form_data.js --path config/formConfig.json --outPath form_data.json
  sesTemplates:
    addStage: true # Specifies whether to add stage to template name (default false)
    configFile: "./ses-template.js" # Config file path (default './ses-email-templates/index.js')
    disableAutoDeploy: false
    region: "us-east-1" # Specifies AWS region for SES templates (not required)
```

OK that's alot!😅

Let's break it down...

The name of our serverless service:

```yml
service: serverless-web-forms
```
The serverless version we're using

```yml
frameworkVersion: "2"
```
A boolean stating we want to use the .env feature to pull in our environment variables (more on this later):

```yml
useDotenv: true
```

Next up... the provider section.

The provider is simply our cloud hosting service that we are choosing to "spin-up" our infrastructure with. The Serverless Framework supports other providers such as `Azure` and `Google`.

The name the provider we're using:

```yml
provider:
  name: aws 
```
This is the current stage of our project for _multi-staged_ deployments. We can change this with the cli options.
You don't really want to deploy straight to production do you?🙃

```yml
  stage: ${opt:stage}
```
This is the runtime we'd like our Lambda functions to use. You could choose another runtime supported by AWS Lambda but I've gone with nodejs:

```yml
  runtime: nodejs12.x
```

The region we'd like to deploy our resources. So let's pick one of the cheapest ones:

```yml
  region: us-east-1
```

So this makes a horrible deprecation warning go away and uses the new Lambda hashing version...

```yml
  LambdaHashingVersion: 20201221
```

These are our environment variables that will be accessible in all of the Lambda functions we add. `ENTRIES_TABLE` is the name of the DynamoDB table we will store our form submissions in whilst we are getting the users to click the verification link we email them. The `SNS_TOPIC_ARN` is the ARN of our Simply Notification Service topic that we'll create to let us know of any failures to our services.

```yml
  environment:
    ENTRIES_TABLE: ${self:service}-${opt:stage, self:provider.stage}
    SNS_TOPIC_ARN: !Ref FormsSNSTopic
```

Our serverless forms service will be using API Gateway to create a simple rest API to allow access to our Lambda functions. We will:
  - Secure it with an API key
    - Even though this can be omitted since it will be visible to the keen eye in the HTML source for our static website
 - Add a usage plan to stop 1337 hax0rs hammering our API and running up our bill
 - Add the permissions we need our functions to have when executing. 

This starts off our API Gateway section and `shouldStartNameWithService` will stop another deprecation warning and move the new behaviour (see more on this [here](https://www.serverless.com/framework/docs/deprecations#api-gateway-naming-will-be-changed-to-service-stage)):

```yml
  apiGateway:
    shouldStartNameWithService: true
```

There are a few ways that the Serverless Framework supports for adding API keys. But we will keep it simple and let SF generate us a key, all we need to do is give it a name:

```yml
    apiKeys:
      - name: website
```
This is our best defence against spammers.

We'll set a monthly limit of 300 (or the upper bound of the number of requests you can reasonably expect in a month).

The throttle burst set to 2 (our maximum request bucket size in API Gateway) and rate limit is set to 1. This should be enough for our use case, feel free to change it to suit your requirements.

You can read the AWS docs on API Gateway rate limiting [here](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html).

```yml
    usagePlan:
      quota:
        limit: 300
        period: MONTH
      throttle:
        burstLimit: 2
        rateLimit: 1
```

SF will create an IAM role that will be attached to our Lambda functions.

This section allows us to control what permissions we want to give our functions.

- DynamoDb permissions will be needed to add/query/delete our form submissions.
- SES for sending our verification emails.
- STS is probably quite specific to our setup since we needed to have the Lambda function assume a role to access our Hashi Corp Vault password service.
- SNS for sending notifications to a topic so we can subscribe to them to be notified of any errors that may occur.

```yml
  iamRoleStatements:
    - Effect: Allow
      Action:
        - dynamodb:Query
        - dynamodb:Scan
        - dynamodb:GetItem
        - dynamodb:PutItem
        - ses:SendTemplatedEmail
        - sts:AssumeRole
        - sns:Publish
      Resource: "*"
```

Nearly there! Now we create the function definitions. We've got two Lambda functions. One for handler the form submission and another for handling the form verification/submission of tickets.

The functions section requires a unique name for your function i.e `formSubmission`.

The `memorySize` is how much memory we allocate to our Lambda function. In this case 128Mb is sufficient but with certain functions like those utilising headless-chrome or puppeteer, you'll need to up this value.

`environment` again, specifies the environment variables that we wish to have acess to in the `process.env` object. The `VERIFICATION_FROM_EMAIL_ADDR` variable is simply the email we are sending notifiction emails from. You should set this up in the SES management console beforehand.

`description` is.. well.. you guessed that one.😉

`events` are the API Gateway events for accessing executing this function.

The `path` is the URL path we'll use for submitting our request e.g `your-api-gateway.com/{stage}/formSubmit`

`method` is the request type i.e `POST` or `GET`.

`private` specifies whether or not an API key is needed to execute the function.

`cors` - oh CORS. My worst enemy, it seems 😂! This allows us to set a Cross-Origin Reosurce Sharing policy for requests. This is needed so that our static website can successfully submit a `POST` request. You can explicitly set the origins you know that will be using your API endpoint.

```yml
functions:
  formSubmission:
    handler: index.submit
    memorySize: 128
    environment:
      VERIFICATION_FROM_EMAIL_ADDR: ${env:VERIFICATION_FROM_EMAIL_ADDR}
    description: Save the form entry details to DynamoDB and send the verification email.
    events:
      - http:
          path: formSubmit
          method: post
          private: true
          cors:
            origin: "*"
            headers:
              - Content-Type
              - X-Amz-Date
              - Authorization
              - X-Api-Key
              - X-Amz-Security-Token
              - X-Amz-User-Agent
            allowCredentials: true
  formVerification:
    handler: index.verify
    memorySize: 128
    environment:
      VAULT_DOMAIN: ${env:VAULT_DOMAIN}
      VAULT_PORT: ${env:VAULT_PORT}
      VAULT_IAM_ROLE: ${env:VAULT_IAM_ROLE}
      VAULT_SECRET_PATH: ${env:VAULT_SECRET_PATH}
      SERVICE_DESK_USERNAME: ${env:SERVICE_DESK_USERNAME}
      SERVICE_DESK_DOMAIN: ${env:SERVICE_DESK_DOMAIN}
      VERIFICATION_FROM_EMAIL_ADDR: ${env:VERIFICATION_FROM_EMAIL_ADDR}
    description: Verify the GET token header from the email verification link. Create the new Ticket. Delete the form entry from DynamoDB.
    events:
      - http:
          path: formVerfiy
          method: get
          private: false
```

Now onto the resources section. This allows us to create additional AWS resources that we need for our forms service. These are in a CloudFormation-type format.

We'll create a new SNS topic for our failure notifications to be sent to.

```yml
resources:
  Resources:
    FormsSNSTopic:
      Type: "AWS::SNS::Topic"
      Properties:
        TopicName: ServerlessFormsTopic
```

Next we'll add a No-SQL DynamoDB table to store our form entries.

We only need to supply a "primary key" attribute. When submitting the entries we'll make sure that the structure is correct and we don't need to worry about adding other attributes to keep it simple. The `TableName` value we are using the special Serverless Framework self syntax to reference our `ENTRIES_TABLE` value in the provider environment section.

```yml
    FormEntriesDynamoDbTable:
      Type: "AWS::DynamoDB::Table"
      DeletionPolicy: Retain
      Properties:
        TableName: ${self:provider.environment.ENTRIES_TABLE}
        AttributeDefinitions:
          - AttributeName: "id"
            AttributeType: "S"
        KeySchema:
          - AttributeName: "id"
            KeyType: "HASH"
        ProvisionedThroughput:
          ReadCapacityUnits: 1
          WriteCapacityUnits: 1
        StreamSpecification:
          StreamViewType: "NEW_AND_OLD_IMAGES"
```

The following `package` section allows us to decide what files we'd like to be packaged in our Lambda function. This will keep things clean and ensure we can still test and edit our Lambda function within the AWS management console if we desire.

Depending on your implementation of this service you may not need these exact exclusions/inclusions so tailor to your requirements.

```yml
package:
  exclude:
    - ./form_data.json
    - ./package.json
    - ./setup_form_data.js
    - ./yarn.lock
    - ./config/**
    - ./templates/**
    - ./html_examples/**
  include:
    - ./index.js
    - ./form_data.json
```

The `plugins` section lets us add any Serverless plugins we need to do some extra magic. 

`serverless-offline` allows you to test your functions locally. 

`serverless-plugin-scripts` allows you to hook into the Serverless life-cycle hooks to run additional scripts. We needed this plugin to run a script that collects/validates Atlassian Service Desk request types and outputs a `form_data.json` file with the valid field data that a certain request type needs.

`"@haftahave/serverless-ses-template"` is an awesome plugin that allows us to create an SES email template for our verification emails - [https://github.com/haftahave/serverless-ses-template](https://github.com/haftahave/serverless-ses-template)

```yml
plugins:
  - serverless-offline
  - serverless-plugin-scripts
  - "@haftahave/serverless-ses-template"
```

The `custom` section is used by Serverless plugins. `scripts` contains our `collectFormData` custom command so we can run `$ sls collectFormData` to run our nodejs script.

`sesTemplates` is the configuration for the SES template plugin. The `configFile` points to a nodejs script.

```yml
custom:
  scripts:
    commands:
      collectFormData: node setup_form_data.js --path config/formConfig.json --outPath form_data.json
  sesTemplates:
    addStage: true # Specifies whether to add stage to template name (default false)
    configFile: "./ses-template.js" # Config file path (default './ses-email-templates/index.js')
    disableAutoDeploy: false
    region: "us-east-1" # Specifies AWS region for SES templates (not required)
```

Below is the `ses-template.js` config script. Make sure to change the `templateList` array to suit your requirements. You can also modify folder path to your templates. With this script you'll need to add your SES email HTML template to `templates/{templateIDd}.html` and a plain txt alternative for non-HTML email clients.

```javascript
const path = require("path");
// List of templates
const templateList = [
  {
    templateId: "confirmation",
    templateSubject: "Linaro - Confirm your website form submission",
  },
];
// Check the templates list for duplicates
// and throw and error if a template ID is duplicated.
templateList.reduce((acc, templateInfo) => {
  const { templateId } = templateInfo;
  if (acc[templateId] === 1) {
    throw new Error(
      `Error: Duplicate SES template id "${templateId}", they should be unique`
    );
  }
  acc[templateId] = 1;
  return acc;
}, {});
/**
 * @param {Object} serverless - Serverless instance
 * @param {Object} _options - runtime options
 * @returns {Promise<{name: string, subject: string, html: string, text}[]>}
 */
module.exports = async (serverless, _options) => {
  // You can load template configuration from filesystem using serverless object + runtime options
  // or from any other source like database or API
  const sesEmailTemplates = templateList.map((templateInfo) => {
    const { templateId, templateSubject } = templateInfo;
    const templatePathHtml = path.join(
      __dirname,
      `templates/${templateId}.html`
    );
    const templatePathTxt = path.join(__dirname, `templates/${templateId}.txt`);

    return {
      name: templateId,
      subject: templateSubject,
      html: serverless.utils.readFileSync(templatePathHtml),
      text: serverless.utils.readFileSync(templatePathTxt),
    };
  });
  return sesEmailTemplates;
};

```

To be continued.... 🙂

If you enjoyed this post then consider following me on Twitter to get notified when I push new posts/updates😅

[https://twitter.com/the_actual_kyle](https://twitter.com/the_actual_kyle)
