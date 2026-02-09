# VHS tape file for thread-mcp demo
# Install VHS: https://github.com/charmbracelet/vhs
# Run: VHS_NO_SANDBOX=true vhs demo/demo.tape

Output demo/demo.gif

Set Shell bash
Set FontSize 14
Set Width 1000
Set Height 700
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 0ms
Set PlaybackSpeed 1

# Hide the command entry — recording starts when script output appears
Hide
Type "node --import tsx demo/demo.ts"
Enter
Sleep 2s
Show

# ~62s script runtime (minus 2s hidden startup) + buffer
Sleep 63s

Sleep 2s
