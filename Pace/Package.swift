// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Pace",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "PaceApp", targets: ["PaceApp"]),
        .library(name: "PaceKit", targets: ["PaceKit"]),
    ],
    targets: [
        // Pure domain + application + infrastructure (no UI). Fully unit-testable.
        .target(name: "PaceKit"),

        // SwiftUI menu-bar app (presentation layer).
        .executableTarget(
            name: "PaceApp",
            dependencies: ["PaceKit"]
        ),

        // Self-contained check runner — works under Command Line Tools (no XCTest needed):
        //   swift run PaceCheck
        .executableTarget(
            name: "PaceCheck",
            dependencies: ["PaceKit"]
        ),
    ]
)
