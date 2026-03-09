import type { Icon } from "@tabler/icons-react"
import type { Page } from "@/components/app-sidebar"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

type NavItem =
  | { title: string; id: Page; href?: never; icon?: Icon }
  | { title: string; href: string; id?: never; icon?: Icon }

interface NavMainProps {
  items: NavItem[]
  currentPage: Page
  onPageChange: (page: Page) => void
}

export function NavMain({ items, currentPage, onPageChange }: NavMainProps) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const key = "id" in item ? item.id : item.href
            if ("href" in item) {
              return (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton asChild tooltip={item.title} className="[&_span]:text-[var(--button-accent)] [&_svg]:text-[var(--button-accent)] [&_a:hover_span]:text-[var(--button-accent)] [&_a:hover_svg]:text-[var(--button-accent)]">
                    <a href={item.href}>
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            }
            return (
              <SidebarMenuItem key={key}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={currentPage === item.id}
                  onClick={() => onPageChange(item.id)}
                  className="[&_span]:text-[var(--button-accent)] [&_svg]:text-[var(--button-accent)] data-[active=true]:[&_span]:text-[var(--button-accent)] data-[active=true]:[&_svg]:text-[var(--button-accent)] hover:[&_span]:text-[var(--button-accent)] hover:[&_svg]:text-[var(--button-accent)]"
                >
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
