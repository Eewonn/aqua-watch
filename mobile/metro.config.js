const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

const originalResolveRequest = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-linear-gradient') {
    moduleName = 'expo-linear-gradient'
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
