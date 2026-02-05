import * as React from "react"
import {
    IconBrain,
    IconChartBar,
    IconFlame,
    IconGraph,
    IconHome,
    IconMathFunction,
} from "@tabler/icons-react"

import { NavMain } from "@/components/nav-main"
import {
    Sidebar,
    SidebarContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar"

export type Page = 'home' | 'conditional-probability' | 'empirical-bayes' | 'neighbor-divergence' | 'c2st'

const navItems = [
    {
        title: "Home",
        id: "home" as Page,
        icon: IconHome,
    },
    {
        title: "Conditional Probability",
        id: "conditional-probability" as Page,
        icon: IconMathFunction,
    },
    {
        title: "Empirical Bayes Pooling",
        id: "empirical-bayes" as Page,
        icon: IconChartBar,
    },
    {
        title: "Neighbor Divergence",
        id: "neighbor-divergence" as Page,
        icon: IconGraph,
    },
    {
        title: "C2ST",
        id: "c2st" as Page,
        icon: IconBrain,
    },
]

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
    currentPage: Page
    onPageChange: (page: Page) => void
}

export function AppSidebar({ currentPage, onPageChange, ...props }: AppSidebarProps) {
    return (
        <Sidebar collapsible="offcanvas" {...props}>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            asChild
                            className="data-[slot=sidebar-menu-button]:!p-1.5"
                        >
                            <a href="#">
                                <IconFlame className="!size-5" />
                                <span className="text-base font-semibold">Wildfire Intel</span>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <NavMain
                    items={navItems}
                    currentPage={currentPage}
                    onPageChange={onPageChange}
                />
            </SidebarContent>
        </Sidebar>
    )
}
