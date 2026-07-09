import SwiftUI

@main
struct PaceApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        // A normal window so the skeleton is clearly visible (the final product is menu-bar-only).
        Window("Pace — Lernplaner", id: "main") {
            MenuBarView(model: model)
                .frame(minWidth: 340, minHeight: 380)
        }
        .windowResizability(.contentSize)

        // Plus a menu-bar item (🧠, top-right) for the eventual always-on use.
        MenuBarExtra("Pace", systemImage: "brain.head.profile") {
            MenuBarView(model: model)
        }
        .menuBarExtraStyle(.window)
    }
}
