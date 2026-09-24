import React from 'react';
import { AuthScreens, AuthScreensProps } from './AuthScreens';

export interface AuthGateScreenProps extends AuthScreensProps {}

/**
 * AuthGateScreen delegates to the single canonical AuthScreens component,
 * ensuring one unified login and authentication form throughout SchoolSphere.
 */
export const AuthGateScreen: React.FC<AuthGateScreenProps> = (props) => {
  return <AuthScreens {...props} />;
};

export default AuthGateScreen;
