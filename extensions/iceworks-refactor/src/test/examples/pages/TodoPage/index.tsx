import React, { Component } from 'react';
import Todo, { Todo2 } from '../../components/Todo';

const a = 12;

export default class TodoComponent extends Component {
  text1: number;

  name2: string;

  name3: string;

  name4 = 'a';

  constructor(props) {
    super(props);
    this.text1 = 1;
    this.name2 = 'name2';
    this.name3 = '3';
  }

  handleClick = () => {
    console.log('hello world');
  };

  render() {
    return (
      <div id={this.name2}>
        123
        <Todo onClick={this.handleClick} text={a} name={this.name2} />
        <Todo2 age={10} name={this.name4} />
      </div>
    );
  }
}
