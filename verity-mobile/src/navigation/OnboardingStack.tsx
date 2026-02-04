import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import ExplainScreenOne from '../screens/onboarding/ExplainScreenOne';
import ExplainScreenTwo from '../screens/onboarding/ExplainScreenTwo';
import ProfileSetupScreen from '../screens/onboarding/ProfileSetupScreen';

type OnboardingStackParamList = {
  Welcome: undefined;
  ExplainOne: undefined;
  ExplainTwo: undefined;
  ProfileSetup: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="ExplainOne" component={ExplainScreenOne} />
      <Stack.Screen name="ExplainTwo" component={ExplainScreenTwo} />
      <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
    </Stack.Navigator>
  );
}
