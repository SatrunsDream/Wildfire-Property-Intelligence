import * as React from "react"
import {
    IconBook,
    IconBrain,
    IconChartBar,
    IconFlame,
    IconGitCompare,
    IconGraph,
    IconHome,
    IconMathFunction,
    IconMap,
    IconPalette,
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

export type Page = 'home' | 'conditional-probability' | 'empirical-bayes' | 'neighbor-divergence' | 'c2st' | 'morans-i' | 'group-divergence' | 'color-map'

const navItems = [
    {
        title: "Home",
        id: "home" as Page,
        icon: IconHome,
    },
    {
        title: "Case Study",
        href: "/viz",
        icon: IconBook,
    },
    {
        title: "Empirical Bayes Pooling",
        id: "empirical-bayes" as Page,
        icon: IconChartBar,
    },
    {
        title: "Conditional Pooling",
        id: "conditional-probability" as Page,
        icon: IconMathFunction,
    },
    {
        title: "Neighbor Divergence",
        id: "neighbor-divergence" as Page,
        icon: IconGraph,
    },
    {
        title: "Group-Level Divergence",
        id: "group-divergence" as Page,
        icon: IconGitCompare,
    },
    {
        title: "C2ST",
        id: "c2st" as Page,
        icon: IconBrain,
    },
    {
        title: "Moran's I",
        id: "morans-i" as Page,
        icon: IconMap,
    },
    {
        title: "Color Distribution Map",
        id: "color-map" as Page,
        icon: IconPalette,
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
                            className="data-[slot=sidebar-menu-button]:!p-1.5 [&_span]:text-[var(--button-accent)] [&_svg]:text-[var(--button-accent)]"
                        >
                            <a href="#">
                                <IconFlame className="!size-5" />
                                <span className="text-base font-semibold">Wildfire Property Intelligence: Finding Outliers Before Fire Finds Them First</span>
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
