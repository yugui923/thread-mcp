# VHS tape file for thread-mcp demo
# Install VHS: https://github.com/charmbracelet/vhs
# Run: vhs demo/demo.tape

Output demo/demo.gif

Set Shell bash
Set FontSize 14
Set Width 1000
Set Height 700
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 0ms
Set PlaybackSpeed 0.5

Sleep 500ms

Type "node --import tsx demo/demo.ts"
Enter

Sleep 25s

Sleep 2s
