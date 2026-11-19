#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import "Orientation.h"

@interface AppDelegate ()
@property (nonatomic, copy, nullable) NSDictionary *startupLaunchOptions;
@property (nonatomic, weak) UIWindowScene *startupWindowScene;
@end

@implementation AppDelegate

- (UIInterfaceOrientationMask)application:(UIApplication *)application supportedInterfaceOrientationsForWindow:(UIWindow *)window
{
  return [Orientation getOrientation];
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.startupLaunchOptions = [launchOptions copy];
  return YES;
}

- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }

  AppDelegate *applicationDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
  self.moduleName = @"StreamTVDepot";
  self.initialProps = @{};
  self.startupWindowScene = (UIWindowScene *)scene;
  [super application:UIApplication.sharedApplication
      didFinishLaunchingWithOptions:applicationDelegate.startupLaunchOptions ?: @{}];
  self.startupWindowScene = nil;
}

- (void)setWindow:(UIWindow *)window
{
  if (self.startupWindowScene && window.windowScene != self.startupWindowScene) {
    // RCTAppDelegate creates a frame-based window; bind it to the active scene.
    window = [[UIWindow alloc] initWithWindowScene:self.startupWindowScene];
  }
  [super setWindow:window];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
