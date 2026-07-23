import SwiftUI

/// Keeps the controls distinctly tactile on the newest platforms while still
/// rendering as restrained material chips on the iOS 17 deployment baseline.
extension View {
    @ViewBuilder
    func liquidGlass<S: Shape>(in shape: S) -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(.regular, in: shape)
        } else {
            background(.ultraThinMaterial, in: shape)
                .overlay(shape.stroke(.white.opacity(0.14), lineWidth: 1))
        }
    }
}
