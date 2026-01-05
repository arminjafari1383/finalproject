import React from "react";
import { NavLink } from "react-router-dom";
import "./Navbar.css";

import Wallet from "../assets/wallet.png";
import Task from "../assets/aboutus.png";
import Stake from "../assets/stake.png";
import Mine from "../assets/mine.png"
import Friend from "../assets/friends.png"
import Aboutus from "../assets/aboutus.png"


const Navbar = () => {
  return(
    <nav className="navbar">
      <NavLink to="/Timer" className="nav-item">
        <img src={Mine} alt="Mine icon"/>
        <span>Mine</span>
      </NavLink>
      <NavLink to="/stake" className="nav-item">
        <img src={Stake} alt="Stake icon"/>
        <span>Stake</span>
      </NavLink>
      <NavLink to="/referrals" className="nav-item">
        <img src={Friend} alt="Friends icon"/>
        <span>Friends</span>
      </NavLink>
      <NavLink to="/Aboutus" className="nav-item">
        <img src={Aboutus} alt="Aboutus icon"/>
        <span>About Us</span>
      </NavLink>
      <NavLink to="/" className="nav-item">
        <img src={Wallet} alt="Wallets icon"/>
        <span>Wallets</span>
      </NavLink>
    </nav>
  );
};
export default Navbar;
