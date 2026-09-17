"use client"
import Link from "next/link"
import { useState } from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { Menu, X, LogOut, ChevronDown, ArrowUpRight } from "lucide-react"

export function HeaderMenu({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="header-actions">
      {email ? (
        <MenuPrimitive.Root>
          <MenuPrimitive.Trigger
            className="account-button"
            aria-label="Account menu"
          >
            <span className="avatar">{email[0].toUpperCase()}</span>
            <ChevronDown size={14} />
          </MenuPrimitive.Trigger>
          <MenuPrimitive.Portal>
            <MenuPrimitive.Positioner
              sideOffset={12}
              align="end"
              className="z-50"
            >
              <MenuPrimitive.Popup className="account-menu">
                <p className="truncate px-3 py-2 text-sm text-muted-foreground">
                  {email}
                </p>
                <MenuPrimitive.Item
                  render={<a href="/logout" />}
                  className="menu-item"
                >
                  <LogOut size={16} />
                  Logout
                </MenuPrimitive.Item>
              </MenuPrimitive.Popup>
            </MenuPrimitive.Positioner>
          </MenuPrimitive.Portal>
        </MenuPrimitive.Root>
      ) : (
        <>
          <Link className="login-link" href="/login">
            Login
          </Link>
          <Link className="primary-button header-cta" href="/signup">
            Get started <ArrowUpRight size={15} />
          </Link>
        </>
      )}
      <button
        className="mobile-toggle"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
      {open && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="mobile-nav"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false)
          }}
        >
          {[
            ["Features", "/#features"],
            ["How it works", "/#how-it-works"],
            ["Pricing", "/#pricing"],
          ].map(([title, href]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}>
              {title}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
