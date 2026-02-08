targetScope = 'resourceGroup'

@description('Azure region for deployment.')
param location string = 'australiaEast'

@description('Name for the Container Apps environment.')
param environmentName string

@description('Name for the API container app.')
param apiName string

@description('Name for the worker container app.')
param workerName string

@description('Azure Container Registry name (globally unique).')
param acrName string

@description('Azure Key Vault name (globally unique).')
param keyVaultName string

@description('Use Key Vault RBAC instead of access policies.')
param keyVaultUseRbac bool = false

@description('Log Analytics workspace name.')
param logAnalyticsName string = '${environmentName}-logs'

@description('PostgreSQL flexible server name (globally unique).')
param postgresServerName string

@description('PostgreSQL database name.')
param postgresDbName string = 'verity'

@description('PostgreSQL admin login.')
param postgresAdminLogin string

@secure()
@description('PostgreSQL admin password.')
param postgresAdminPassword string

@description('Redis cache name (globally unique).')
param redisName string

@description('API container image, e.g. myacr.azurecr.io/verity-api:latest')
param apiImage string

@description('Worker container image, defaults to API image.')
param workerImage string = apiImage

@description('External API URL.')
param apiUrl string

@description('External WebSocket URL.')
param wsUrl string

@description('External App URL.')
param appUrl string

@description('Allowed CORS origins (comma-separated). Defaults to appUrl when empty.')
param appOrigins string = ''

@description('Refresh cookie SameSite policy.')
param refreshCookieSameSite string = 'strict'

@description('Refresh cookie domain (optional).')
param refreshCookieDomain string = ''

@description('Push dispatch webhook URL (optional).')
param pushDispatchWebhookUrl string = ''

@secure()
@description('Moderation admin key.')
param moderationAdminKey string = ''

@description('Enable fallback moderation key behavior.')
param moderationAdminKeyFallback bool = false

@secure()
@description('Twilio account SID (optional in non-production).')
param twilioAccountSid string = ''

@secure()
@description('Twilio auth token (optional in non-production).')
param twilioAuthToken string = ''

@secure()
@description('Twilio Verify service SID (optional in non-production).')
param twilioVerifyServiceSid string = ''

@description('API container target port.')
param apiTargetPort int = 3000

@description('Enable Azure Front Door (WAF + custom domain).')
param enableFrontDoor bool = false

@description('Front Door profile name.')
param frontDoorProfileName string = '${environmentName}-fd'

@description('Front Door endpoint name.')
param frontDoorEndpointName string = '${environmentName}-fde'

@description('Custom domain for API (e.g. api.yourveritydomain.com).')
param frontDoorCustomDomain string = ''

@description('Enable Front Door WAF policy.')
param enableFrontDoorWaf bool = false

@description('Front Door WAF policy name.')
param frontDoorWafPolicyName string = '${environmentName}-waf'

@description('Requests per minute allowed before blocking.')
param frontDoorRateLimit int = 200

@description('Paths excluded from Front Door rate limiting (prefix match).')
param frontDoorRateLimitExemptPaths array = [
  '/webhooks/stripe'
  '/webhooks/hive'
]

@secure()
@description('JWT base secret (fallback).')
param jwtSecret string

@secure()
@description('JWT access token secret.')
param jwtAccessSecret string

@secure()
@description('JWT refresh token secret.')
param jwtRefreshSecret string

@secure()
@description('Stripe secret key.')
param stripeSecretKey string

@secure()
@description('Stripe webhook secret.')
param stripeWebhookSecret string

@description('Stripe success URL.')
param stripeSuccessUrl string

@description('Stripe cancel URL.')
param stripeCancelUrl string

@description('Stripe price ID for starter pack.')
param stripePriceStarter string

@description('Stripe price ID for plus pack.')
param stripePricePlus string

@description('Stripe price ID for pro pack.')
param stripePricePro string

@secure()
@description('Agora App ID.')
param agoraAppId string

@secure()
@description('Agora App Certificate.')
param agoraAppCertificate string

@description('Agora token TTL in seconds.')
param agoraTokenTtlSeconds int = 45

@secure()
@description('Hive API key.')
param hiveApiKey string

@secure()
@description('Hive webhook secret.')
param hiveWebhookSecret string

@description('Hive stream endpoint URL.')
param hiveStreamUrl string

@description('Hive screenshot endpoint URL.')
param hiveScreenshotUrl string

var logAnalyticsApiVersion = '2022-10-01'
var redisApiVersion = '2023-04-01'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource managedEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: listKeys(logAnalytics.id, logAnalyticsApiVersion).primarySharedKey
      }
    }
  }
}

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${environmentName}-identity'
  location: location
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-01-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, appIdentity.id, 'AcrPull')
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'B_Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    version: '16'
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2022-12-01' = {
  name: '${postgres.name}/${postgresDbName}'
  properties: {}
}

resource postgresFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = {
  name: '${postgres.name}/AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource redis 'Microsoft.Cache/Redis@2023-04-01' = {
  name: redisName
  location: location
  properties: {
    sku: {
      name: 'Basic'
      family: 'C'
      capacity: 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    enableRbacAuthorization: keyVaultUseRbac
    sku: {
      name: 'standard'
      family: 'A'
    }
    accessPolicies: keyVaultUseRbac ? [] : [
      {
        tenantId: subscription().tenantId
        objectId: appIdentity.properties.principalId
        permissions: {
          secrets: [
            'get'
            'list'
          ]
        }
      }
    ]
  }
}

resource kvSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (keyVaultUseRbac) {
  name: guid(keyVault.id, appIdentity.id, 'kv-secrets-user')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

var postgresHost = '${postgresServerName}.postgres.database.azure.com'
var databaseUrl = 'postgres://${postgresAdminLogin}:${postgresAdminPassword}@${postgresHost}:5432/${postgresDbName}?sslmode=require'
var redisKeys = listKeys(redis.id, redisApiVersion)
var redisUrl = 'rediss://:${redisKeys.primaryKey}@${redis.properties.hostName}:6380'
var resolvedAppOrigins = empty(appOrigins) ? appUrl : appOrigins
resource kvDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/database-url'
  properties: {
    value: databaseUrl
  }
}

resource kvRedisUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/redis-url'
  properties: {
    value: redisUrl
  }
}

resource kvJwtSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/jwt-secret'
  properties: {
    value: jwtSecret
  }
}

resource kvJwtAccessSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/jwt-access-secret'
  properties: {
    value: jwtAccessSecret
  }
}

resource kvJwtRefreshSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/jwt-refresh-secret'
  properties: {
    value: jwtRefreshSecret
  }
}

resource kvStripeSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/stripe-secret-key'
  properties: {
    value: stripeSecretKey
  }
}

resource kvStripeWebhookSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/stripe-webhook-secret'
  properties: {
    value: stripeWebhookSecret
  }
}

resource kvAgoraCert 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/agora-app-certificate'
  properties: {
    value: agoraAppCertificate
  }
}

resource kvHiveApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/hive-api-key'
  properties: {
    value: hiveApiKey
  }
}

resource kvHiveWebhookSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/hive-webhook-secret'
  properties: {
    value: hiveWebhookSecret
  }
}

resource kvModerationAdminKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/moderation-admin-key'
  properties: {
    value: moderationAdminKey
  }
}

resource kvTwilioAccountSid 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/twilio-account-sid'
  properties: {
    value: twilioAccountSid
  }
}

resource kvTwilioAuthToken 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/twilio-auth-token'
  properties: {
    value: twilioAuthToken
  }
}

resource kvTwilioVerifyServiceSid 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVault.name}/twilio-verify-service-sid'
  properties: {
    value: twilioVerifyServiceSid
  }
}

var apiSecrets = [
  { name: 'database-url', keyVaultUrl: kvDatabaseUrl.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'redis-url', keyVaultUrl: kvRedisUrl.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'jwt-secret', keyVaultUrl: kvJwtSecret.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'jwt-access-secret', keyVaultUrl: kvJwtAccessSecret.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'jwt-refresh-secret', keyVaultUrl: kvJwtRefreshSecret.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'stripe-secret-key', keyVaultUrl: kvStripeSecret.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'stripe-webhook-secret', keyVaultUrl: kvStripeWebhookSecret.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'agora-app-certificate', keyVaultUrl: kvAgoraCert.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'hive-api-key', keyVaultUrl: kvHiveApiKey.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'hive-webhook-secret', keyVaultUrl: kvHiveWebhookSecret.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'moderation-admin-key', keyVaultUrl: kvModerationAdminKey.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'twilio-account-sid', keyVaultUrl: kvTwilioAccountSid.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'twilio-auth-token', keyVaultUrl: kvTwilioAuthToken.properties.secretUriWithVersion, identity: appIdentity.id }
  { name: 'twilio-verify-service-sid', keyVaultUrl: kvTwilioVerifyServiceSid.properties.secretUriWithVersion, identity: appIdentity.id }
]

resource apiApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: apiName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: apiTargetPort
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: appIdentity.id
        }
      ]
      secrets: apiSecrets
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          resources: {
            cpu: 0.5
            memory: '1.0Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: string(apiTargetPort) }
            { name: 'ENABLE_MATCHING_WORKER', value: 'false' }
            { name: 'API_URL', value: apiUrl }
            { name: 'WS_URL', value: wsUrl }
            { name: 'APP_URL', value: appUrl }
            { name: 'APP_ORIGINS', value: resolvedAppOrigins }
            { name: 'REFRESH_COOKIE_SAMESITE', value: refreshCookieSameSite }
            { name: 'REFRESH_COOKIE_DOMAIN', value: refreshCookieDomain }
            { name: 'PUSH_DISPATCH_WEBHOOK_URL', value: pushDispatchWebhookUrl }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'REDIS_URL', secretRef: 'redis-url' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'JWT_ACCESS_SECRET', secretRef: 'jwt-access-secret' }
            { name: 'JWT_REFRESH_SECRET', secretRef: 'jwt-refresh-secret' }
            { name: 'MODERATION_ADMIN_KEY', secretRef: 'moderation-admin-key' }
            { name: 'MODERATION_ADMIN_KEY_FALLBACK', value: moderationAdminKeyFallback ? 'true' : 'false' }
            { name: 'TWILIO_ACCOUNT_SID', secretRef: 'twilio-account-sid' }
            { name: 'TWILIO_AUTH_TOKEN', secretRef: 'twilio-auth-token' }
            { name: 'TWILIO_VERIFY_SERVICE_SID', secretRef: 'twilio-verify-service-sid' }
            { name: 'AGORA_APP_ID', value: agoraAppId }
            { name: 'AGORA_APP_CERTIFICATE', secretRef: 'agora-app-certificate' }
            { name: 'AGORA_TOKEN_TTL_SECONDS', value: string(agoraTokenTtlSeconds) }
            { name: 'HIVE_STREAM_URL', value: hiveStreamUrl }
            { name: 'HIVE_SCREENSHOT_URL', value: hiveScreenshotUrl }
            { name: 'HIVE_API_KEY', secretRef: 'hive-api-key' }
            { name: 'HIVE_WEBHOOK_SECRET', secretRef: 'hive-webhook-secret' }
            { name: 'STRIPE_SECRET_KEY', secretRef: 'stripe-secret-key' }
            { name: 'STRIPE_WEBHOOK_SECRET', secretRef: 'stripe-webhook-secret' }
            { name: 'STRIPE_SUCCESS_URL', value: stripeSuccessUrl }
            { name: 'STRIPE_CANCEL_URL', value: stripeCancelUrl }
            { name: 'STRIPE_PRICE_STARTER', value: stripePriceStarter }
            { name: 'STRIPE_PRICE_PLUS', value: stripePricePlus }
            { name: 'STRIPE_PRICE_PRO', value: stripePricePro }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

resource workerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: workerName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      registries: [
        {
          server: acr.properties.loginServer
          identity: appIdentity.id
        }
      ]
      secrets: apiSecrets
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: workerImage
          command: [
            'node'
            'dist/main.js'
          ]
          resources: {
            cpu: 0.25
            memory: '0.5Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: string(apiTargetPort) }
            { name: 'ENABLE_MATCHING_WORKER', value: 'true' }
            { name: 'API_URL', value: apiUrl }
            { name: 'WS_URL', value: wsUrl }
            { name: 'APP_URL', value: appUrl }
            { name: 'APP_ORIGINS', value: resolvedAppOrigins }
            { name: 'REFRESH_COOKIE_SAMESITE', value: refreshCookieSameSite }
            { name: 'REFRESH_COOKIE_DOMAIN', value: refreshCookieDomain }
            { name: 'PUSH_DISPATCH_WEBHOOK_URL', value: pushDispatchWebhookUrl }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'REDIS_URL', secretRef: 'redis-url' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'JWT_ACCESS_SECRET', secretRef: 'jwt-access-secret' }
            { name: 'JWT_REFRESH_SECRET', secretRef: 'jwt-refresh-secret' }
            { name: 'MODERATION_ADMIN_KEY', secretRef: 'moderation-admin-key' }
            { name: 'MODERATION_ADMIN_KEY_FALLBACK', value: moderationAdminKeyFallback ? 'true' : 'false' }
            { name: 'TWILIO_ACCOUNT_SID', secretRef: 'twilio-account-sid' }
            { name: 'TWILIO_AUTH_TOKEN', secretRef: 'twilio-auth-token' }
            { name: 'TWILIO_VERIFY_SERVICE_SID', secretRef: 'twilio-verify-service-sid' }
            { name: 'AGORA_APP_ID', value: agoraAppId }
            { name: 'AGORA_APP_CERTIFICATE', secretRef: 'agora-app-certificate' }
            { name: 'AGORA_TOKEN_TTL_SECONDS', value: string(agoraTokenTtlSeconds) }
            { name: 'HIVE_STREAM_URL', value: hiveStreamUrl }
            { name: 'HIVE_SCREENSHOT_URL', value: hiveScreenshotUrl }
            { name: 'HIVE_API_KEY', secretRef: 'hive-api-key' }
            { name: 'HIVE_WEBHOOK_SECRET', secretRef: 'hive-webhook-secret' }
            { name: 'STRIPE_SECRET_KEY', secretRef: 'stripe-secret-key' }
            { name: 'STRIPE_WEBHOOK_SECRET', secretRef: 'stripe-webhook-secret' }
            { name: 'STRIPE_SUCCESS_URL', value: stripeSuccessUrl }
            { name: 'STRIPE_CANCEL_URL', value: stripeCancelUrl }
            { name: 'STRIPE_PRICE_STARTER', value: stripePriceStarter }
            { name: 'STRIPE_PRICE_PLUS', value: stripePricePlus }
            { name: 'STRIPE_PRICE_PRO', value: stripePricePro }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output apiFqdn string = apiApp.properties.configuration.ingress.fqdn
output postgresHost string = postgresHost
output redisHost string = redis.properties.hostName

// Optional Front Door (standard/premium)
resource frontDoorProfile 'Microsoft.Cdn/profiles@2023-05-01' = if (enableFrontDoor) {
  name: frontDoorProfileName
  location: 'Global'
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
}

resource frontDoorEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-05-01' = if (enableFrontDoor) {
  name: '${frontDoorProfile.name}/${frontDoorEndpointName}'
  location: 'Global'
  properties: {
    enabledState: 'Enabled'
  }
}

resource frontDoorOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = if (enableFrontDoor) {
  name: '${frontDoorProfile.name}/verity-origin-group'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
    }
    healthProbeSettings: {
      probePath: '/health'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 30
    }
  }
}

resource frontDoorOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = if (enableFrontDoor) {
  name: '${frontDoorProfile.name}/verity-origin-group/api-origin'
  properties: {
    hostName: apiApp.properties.configuration.ingress.fqdn
    httpPort: 80
    httpsPort: 443
    originHostHeader: apiApp.properties.configuration.ingress.fqdn
    enabledState: 'Enabled'
  }
}

resource frontDoorRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = if (enableFrontDoor) {
  name: '${frontDoorProfile.name}/${frontDoorEndpointName}/verity-route'
  properties: {
    originGroup: {
      id: frontDoorOriginGroup.id
    }
    supportedProtocols: [
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: true
    httpsRedirectEnabled: true
  }
}

resource frontDoorCustomDomainRes 'Microsoft.Cdn/profiles/customDomains@2023-05-01' = if (enableFrontDoor && frontDoorCustomDomain != '') {
  name: '${frontDoorProfile.name}/verity-custom-domain'
  properties: {
    hostName: frontDoorCustomDomain
  }
}

resource frontDoorCustomDomainAssoc 'Microsoft.Cdn/profiles/afdEndpoints/customDomains@2023-05-01' = if (enableFrontDoor && frontDoorCustomDomain != '') {
  name: '${frontDoorProfile.name}/${frontDoorEndpointName}/verity-custom-domain-assoc'
  properties: {
    customDomain: {
      id: frontDoorCustomDomainRes.id
    }
  }
}

resource frontDoorWaf 'Microsoft.Cdn/profiles/webApplicationFirewallPolicies@2023-05-01' = if (enableFrontDoor && enableFrontDoorWaf) {
  name: '${frontDoorProfile.name}/${frontDoorWafPolicyName}'
  location: 'Global'
  properties: {
    policySettings: {
      enabledState: 'Enabled'
      mode: 'Prevention'
      requestBodyCheck: true
    }
    managedRules: {
      managedRuleSets: [
        {
          ruleSetType: 'DefaultRuleSet'
          ruleSetVersion: '1.1'
        }
      ]
    }
    customRules: {
      rules: [
        {
          name: 'rate-limit'
          priority: 1
          enabledState: 'Enabled'
          ruleType: 'RateLimitRule'
          rateLimitDurationInMinutes: 1
          rateLimitThreshold: frontDoorRateLimit
          action: 'Block'
          matchConditions: [
            {
              matchVariable: 'RemoteAddr'
              operator: 'IPMatch'
              matchValues: [
                '0.0.0.0/0'
              ]
            }
            {
              matchVariable: 'RequestUri'
              operator: 'BeginsWith'
              matchValues: frontDoorRateLimitExemptPaths
              negateCondition: true
            }
          ]
        }
      ]
    }
  }
}

resource frontDoorSecurityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2023-05-01' = if (enableFrontDoor && enableFrontDoorWaf) {
  name: '${frontDoorProfile.name}/verity-security-policy'
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: {
        id: frontDoorWaf.id
      }
      associations: [
        {
          domains: [
            {
              id: frontDoorEndpoint.id
            }
          ]
          patternsToMatch: [
            '/*'
          ]
        }
      ]
    }
  }
}

output frontDoorEndpointHost string = enableFrontDoor ? frontDoorEndpoint.properties.hostName : ''
