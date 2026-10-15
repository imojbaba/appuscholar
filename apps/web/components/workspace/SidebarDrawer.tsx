"use client";
import { Dialog } from "radix-ui";
import { X } from "@phosphor-icons/react";
import { useRestoreFocus } from "@/lib/useRestoreFocus";
import { Sidebar } from "./Sidebar";
import { useWorkspace } from "./WorkspaceContext";

/**
 * The phone layout's tool list (mockup 05): the sidebar in a left drawer opened from the header's menu button.
 * A Radix Dialog, so focus is trapped inside, Escape and the close button close it, focus returns to the menu button,
 * and the rest of the page is hidden from screen readers while it is open. Picking a tool, New project or Research Projects closes it first.
 */
export function SidebarDrawer() {
  const { drawerOpen, setDrawerOpen } = useWorkspace();
  const focus = useRestoreFocus();
  return (
    <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content className="drawer" aria-label="Writing tools" aria-describedby={undefined} data-testid="sidebar-drawer" {...focus}>
          <div className="drawer-head">
            <Dialog.Title className="drawer-title">Writing tools</Dialog.Title>
            <Dialog.Close className="icon" aria-label="Close the tool list" data-testid="drawer-close"><X aria-hidden="true" /></Dialog.Close>
          </div>
          <Sidebar inDrawer onPick={() => setDrawerOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
