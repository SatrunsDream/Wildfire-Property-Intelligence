import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from './ui/button'

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark' || theme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  )
}
