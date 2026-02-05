import type { Icon } from "@tabler/icons-react"
import type { Page } from "@/components/app-sidebar"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

interface NavMainProps {
  items: {
    title: string
    id: Page
    icon?: Icon
  }[]
  currentPage: Page
  onPageChange: (page: Page) => void
}

export function NavMain({ items, currentPage, onPageChange }: NavMainProps) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton 
                tooltip={item.title}
                isActive={currentPage === item.id}
                onClick={() => onPageChange(item.id)}
              >
                {item.icon && <item.icon />}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
